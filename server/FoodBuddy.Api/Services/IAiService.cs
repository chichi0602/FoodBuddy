using FoodBuddy.Api.Models;

namespace FoodBuddy.Api.Services;

public interface IAiService
{
    /// <summary>是否為示範資料（未設定 Azure OpenAI 金鑰）</summary>
    bool IsMock { get; }

    Task<SearchConditions> ParseAsync(string query, CancellationToken ct);

    Task<IReadOnlyList<Recommendation>> RecommendAsync(
        string query, SearchConditions conditions, IReadOnlyList<string> excludeNames, CancellationToken ct);
}

/// <summary>AI 服務失敗；Message 會直接顯示給使用者，不可含金鑰或原始錯誤內容</summary>
public class AiServiceException(string message, Exception? inner = null) : Exception(message, inner);
