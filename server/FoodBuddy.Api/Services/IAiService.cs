using FoodBuddy.Api.Models;
using FoodBuddy.Api.Services.Places;

namespace FoodBuddy.Api.Services;

public interface IAiService
{
    /// <summary>是否為示範資料（未設定 Azure OpenAI 金鑰）</summary>
    bool IsMock { get; }

    Task<SearchConditions> ParseAsync(string query, CancellationToken ct);

    /// <summary>從真實候選店家中挑出最符合的幾間並分析；只能回傳候選清單中的 id</summary>
    Task<IReadOnlyList<AiAnalysis>> RankAsync(
        string query, SearchConditions conditions, IReadOnlyList<PlaceCandidate> candidates, CancellationToken ct);
}

/// <summary>AI 服務失敗；Message 會直接顯示給使用者，不可含金鑰或原始錯誤內容</summary>
public class AiServiceException(string message, Exception? inner = null) : Exception(message, inner);
