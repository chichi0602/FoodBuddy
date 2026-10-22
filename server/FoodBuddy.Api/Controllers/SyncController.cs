using System.Security.Claims;
using System.Text.Json;
using FoodBuddy.Api.Data;
using FoodBuddy.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FoodBuddy.Api.Controllers;

public record SyncChange(string Collection, string Id, JsonElement? Data, bool Deleted, long UpdatedAt);
public record SyncRequest(long Since, IReadOnlyList<SyncChange>? Changes);
public record SyncResponse(long Cursor, bool HasMore, IReadOnlyList<SyncChange> Changes);

/// <summary>
/// 前端 IndexedDB 與伺服器的雙向同步：先寫入前端送來的變更，再回傳 since 之後其他裝置的變更。
/// 衝突時以前端修改時間較新的為準（最後寫入的贏）。
/// </summary>
[ApiController]
[Authorize]
[Route("api/sync")]
public class SyncController(AppDbContext db) : ControllerBase
{
    public static readonly HashSet<string> Collections = ["places", "userPlaces", "visits", "tags", "searchHistory", "dismissed"];

    const int MaxChangesPerRequest = 500;
    const int MaxRecordBytes = 4 * 1024 * 1024;
    const int PageSize = 300;
    public const int MaxRecordsPerUser = 20000;
    public const int MaxRequestBytes = 20 * 1024 * 1024;

    // SQLite 一次只能有一個寫入者；版本號用「目前最大值 + 1」，寫入階段排隊避免拿到相同版本
    static readonly SemaphoreSlim WriteLock = new(1, 1);

    [HttpPost]
    [RequestSizeLimit(MaxRequestBytes)]
    public async Task<ActionResult<SyncResponse>> Sync(SyncRequest request, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        // 帳號在其他裝置被刪除時，這台裝置的登入 Cookie 可能還沒過期
        if (!await db.Users.AnyAsync(u => u.Id == userId, ct)) return Unauthorized();
        var changes = request.Changes ?? [];
        if (changes.Count > MaxChangesPerRequest)
            return BadRequest(new ApiError($"一次最多同步 {MaxChangesPerRequest} 筆。"));
        foreach (var c in changes)
        {
            if (!Collections.Contains(c.Collection)) return BadRequest(new ApiError($"不認識的資料類型：{c.Collection}"));
            if (string.IsNullOrEmpty(c.Id) || c.Id.Length > 200) return BadRequest(new ApiError("資料 id 不正確。"));
            if (!c.Deleted && c.Data is not { ValueKind: JsonValueKind.Object }) return BadRequest(new ApiError("資料內容不正確。"));
        }

        var written = new HashSet<long>();
        var rejected = new List<SyncRecord>();
        if (changes.Count > 0)
        {
            await WriteLock.WaitAsync(ct);
            try
            {
                var error = await ApplyAsync(userId, changes, written, rejected, ct);
                if (error is not null) return error;
            }
            finally
            {
                WriteLock.Release();
            }
        }

        // 回傳其他裝置的變更；這次剛寫入的不必傳回去
        var page = await db.SyncRecords.AsNoTracking()
            .Where(r => r.UserId == userId && r.Version > request.Since)
            .OrderBy(r => r.Version)
            .Take(PageSize + 1)
            .ToListAsync(ct);
        var hasMore = page.Count > PageSize;
        if (hasMore) page.RemoveAt(PageSize);

        var cursor = hasMore
            ? page[^1].Version
            : await db.SyncRecords.Where(r => r.UserId == userId).MaxAsync(r => (long?)r.Version, ct) ?? 0;

        // 被拒絕的舊修改：不論版本都把伺服器上較新的內容傳回去，前端才會更正
        var outgoing = page
            .Where(r => !written.Contains(r.Version))
            .Concat(rejected.Where(r => r.Version <= request.Since || r.Version > cursor))
            .Select(r => new SyncChange(
                r.Collection, r.RecordId,
                r.Data is null ? null : JsonDocument.Parse(r.Data).RootElement.Clone(),
                r.Deleted, r.ClientUpdatedAt))
            .ToList();
        return new SyncResponse(cursor, hasMore, outgoing);
    }

    async Task<ActionResult?> ApplyAsync(string userId, IReadOnlyList<SyncChange> changes, HashSet<long> written, List<SyncRecord> rejected, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var version = await db.SyncRecords.Where(r => r.UserId == userId).MaxAsync(r => (long?)r.Version, ct) ?? 0;
        var count = await db.SyncRecords.CountAsync(r => r.UserId == userId && !r.Deleted, ct);

        // 同一批裡同一筆資料只取最新的一次
        var latest = changes
            .GroupBy(c => (c.Collection, c.Id))
            .Select(g => g.MaxBy(c => c.UpdatedAt)!)
            .ToList();
        var ids = latest.Select(c => c.Id).Distinct().ToList();
        var existing = await db.SyncRecords
            .Where(r => r.UserId == userId && ids.Contains(r.RecordId))
            .ToDictionaryAsync(r => (r.Collection, r.RecordId), ct);

        foreach (var c in latest)
        {
            existing.TryGetValue((c.Collection, c.Id), out var record);
            // 伺服器上的版本比較新：不覆蓋，下面回傳時前端會拿到較新的版本
            if (record is not null && record.ClientUpdatedAt > c.UpdatedAt)
            {
                rejected.Add(record);
                continue;
            }

            string? data;
            try
            {
                data = c.Deleted ? null : c.Data!.Value.GetRawText();
            }
            catch (InvalidOperationException)
            {
                return BadRequest(new ApiError("資料內容不是正確的 UTF-8 文字。"));
            }
            if (data is not null && data.Length > MaxRecordBytes)
                return BadRequest(new ApiError("單筆資料太大（可能是照片太多），請減少照片後再試。"));

            if (record is null)
            {
                if (c.Deleted) continue; // 伺服器上本來就沒有，不必留墓碑
                if (++count > MaxRecordsPerUser)
                    return BadRequest(new ApiError($"每個帳號最多 {MaxRecordsPerUser} 筆資料。"));
                record = new SyncRecord { UserId = userId, Collection = c.Collection, RecordId = c.Id };
                db.SyncRecords.Add(record);
            }
            else if (c.Deleted && !record.Deleted) count--;
            else if (!c.Deleted && record.Deleted && ++count > MaxRecordsPerUser)
                return BadRequest(new ApiError($"每個帳號最多 {MaxRecordsPerUser} 筆資料。"));

            record.Data = data;
            record.Deleted = c.Deleted;
            record.ClientUpdatedAt = c.UpdatedAt;
            record.Version = ++version;
            written.Add(record.Version);
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return null;
    }
}
