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

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Endpoint) && !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(Deployment);
}
