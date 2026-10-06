using FoodBuddy.Api.Models;
using FoodBuddy.Api.Services.Places;

namespace FoodBuddy.Api.Services;

public interface IAiService
{
    /// <summary>是否為示範資料（未設定 Azure OpenAI 金鑰）</summary>
    bool IsMock { get; }

    Task<SearchConditions> ParseAsync(string query, CancellationToken ct);

    /// <summary>
    /// 從地圖上的新店與使用者的收藏中挑出最符合的店並分析；只能回傳兩份清單中的 id。
    /// 新店符合使用者口味時要寫 PreferenceReason。
    /// </summary>
    Task<IReadOnlyList<AiAnalysis>> RankAsync(
        string query,
        SearchConditions conditions,
        IReadOnlyList<PlaceCandidate> candidates,
        IReadOnlyList<SavedCandidate> saved,
        TasteProfile? profile,
        CancellationToken ct);
}

/// <summary>AI 服務失敗；Message 會直接顯示給使用者，不可含金鑰或原始錯誤內容</summary>
public class AiServiceException(string message, Exception? inner = null) : Exception(message, inner);
