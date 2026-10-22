using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FoodBuddy.Api.Data;

public class AppUser : IdentityUser
{
    /// <summary>顯示名稱；沒填時畫面用 Email</summary>
    public string? DisplayName { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// 前端 IndexedDB 一筆資料在伺服器的正本。
/// 整筆以 JSON 存放，後端不需要知道各種資料的欄位；Version 是每個使用者自己的遞增版本，前端用來增量拉取。
/// </summary>
public class SyncRecord
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    /// <summary>places、userPlaces、visits、tags、searchHistory、dismissed</summary>
    public string Collection { get; set; } = "";
    public string RecordId { get; set; } = "";
    /// <summary>整筆資料的 JSON；刪除後為 null（保留墓碑讓其他裝置知道要刪除）</summary>
    public string? Data { get; set; }
    public bool Deleted { get; set; }
    public long Version { get; set; }
    /// <summary>前端修改的時間（Unix 毫秒），衝突時較新的贏</summary>
    public long ClientUpdatedAt { get; set; }
}

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<SyncRecord> SyncRecords => Set<SyncRecord>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<SyncRecord>(e =>
        {
            e.Property(r => r.UserId).HasMaxLength(450);
            e.Property(r => r.Collection).HasMaxLength(32);
            e.Property(r => r.RecordId).HasMaxLength(200);
            e.HasIndex(r => new { r.UserId, r.Collection, r.RecordId }).IsUnique();
            e.HasIndex(r => new { r.UserId, r.Version });
            e.HasOne<AppUser>().WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
