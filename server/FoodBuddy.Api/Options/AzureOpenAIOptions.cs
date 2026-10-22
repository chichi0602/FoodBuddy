namespace FoodBuddy.Api.Options;

public class AzureOpenAIOptions
{
    public const string SectionName = "AzureOpenAI";

    /// <summary>例如 https://my-resource.openai.azure.com/</summary>
    public string Endpoint { get; set; } = "";
    public string ApiKey { get; set; } = "";
    /// <summary>Azure 上的部署名稱（不是模型名稱）</summary>
    public string Deployment { get; set; } = "";
    /// <summary>"v1" 使用新版 /openai/v1 路徑；其他值視為舊版 api-version（例如 2025-04-01-preview）</summary>
    public string ApiVersion { get; set; } = "v1";

    /// <summary>各工作可指定不同部署（例如解析用小模型）；沒填就用 Deployment</summary>
    public string? ParseDeployment { get; set; }
    public string? RankDeployment { get; set; }
    public string? InsightDeployment { get; set; }

    /// <summary>開發用：/api/dev/benchmark 要比較的部署名稱</summary>
    public string[] BenchmarkDeployments { get; set; } = [];

    public string ParseModel => string.IsNullOrWhiteSpace(ParseDeployment) ? Deployment : ParseDeployment;
    public string RankModel => string.IsNullOrWhiteSpace(RankDeployment) ? Deployment : RankDeployment;
    public string InsightModel => string.IsNullOrWhiteSpace(InsightDeployment) ? Deployment : InsightDeployment;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Endpoint) && !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(Deployment);
}
