using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FoodBuddy.Api.Models;
using FoodBuddy.Api.Options;
using Microsoft.Extensions.Options;

namespace FoodBuddy.Api.Services;

/// <summary>
/// 直接呼叫 Azure OpenAI Chat Completions REST API（gpt-5 推理模型）。
/// 不使用 SDK，以便完整控制 reasoning_effort、max_completion_tokens 與結構化輸出。
/// </summary>
public class AzureOpenAiService(HttpClient http, IOptions<AzureOpenAIOptions> options, ILogger<AzureOpenAiService> logger)
    : IAiService
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    readonly AzureOpenAIOptions _opt = options.Value;

    public bool IsMock => false;

    const string ParsePrompt = """
        你是美食搜尋助理，負責把使用者的需求解析成結構化條件。
        - 一律使用繁體中文。
        - 地名正規化成正式行政區全名：「高雄左營」→ city「高雄市」、district「左營區」；「台南中西區」→「臺南市」寫成「台南市」。
        - 只有地標（例如「高雄巨蛋」）時，填 landmark，並盡量推斷所在的 city 與 district。
        - 「晚上」「晚餐」→ dinner；「宵夜」→ lateNight；「下午茶」→ teatime。
        - 「每人 500 元左右」→ budgetPerPerson 500；「三個人」→ people 3。
        - 使用者沒提到的欄位填 null 或空陣列，不要自行假設。
        """;

    const string RecommendPrompt = """
        你是熟悉台灣與各地餐廳的美食推薦助理。依據使用者需求與已解析的條件，推薦 5 間符合的店家。
        - 只推薦你有把握真實存在的店家；沒把握時寧可少推薦，不可捏造店名。
        - 地址不確定時填 null，不可猜測。價格與評價用你所知的資訊概估。
        - reason 要具體說明符合使用者哪些條件；pros、cons 各 1～3 點，簡短。
        - matchScore 反映與條件（地區、料理、時段、預算、人數、關鍵字）的符合程度。
        - 不要推薦「已排除的店家」清單中的店。
        - 依 matchScore 由高到低排序，全部使用繁體中文。
        """;

    public async Task<SearchConditions> ParseAsync(string query, CancellationToken ct)
    {
        var json = await CompleteAsync(ParsePrompt, query, "search_conditions", AiSchemas.Conditions(), "minimal", 2000, ct);
        return Deserialize<SearchConditions>(json);
    }

    public async Task<IReadOnlyList<Recommendation>> RecommendAsync(
        string query, SearchConditions conditions, IReadOnlyList<string> excludeNames, CancellationToken ct)
    {
        var user = $"""
            使用者需求：{query}

            已解析條件（JSON）：
            {JsonSerializer.Serialize(conditions, Json)}

            已排除的店家：{(excludeNames.Count == 0 ? "（無）" : string.Join("、", excludeNames))}
            """;
        var json = await CompleteAsync(RecommendPrompt, user, "recommendations", AiSchemas.Recommendations(), "low", 8000, ct);
        var result = Deserialize<RecommendationList>(json);
        return result.Recommendations.OrderByDescending(r => r.MatchScore).ToList();
    }

    record RecommendationList(IReadOnlyList<Recommendation> Recommendations);

    async Task<string> CompleteAsync(
        string system, string user, string schemaName, JsonObject schema, string reasoningEffort, int maxTokens, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["model"] = _opt.Deployment,
            ["messages"] = new JsonArray(
                new JsonObject { ["role"] = "system", ["content"] = system },
                new JsonObject { ["role"] = "user", ["content"] = user }),
            ["response_format"] = new JsonObject
            {
                ["type"] = "json_schema",
                ["json_schema"] = new JsonObject { ["name"] = schemaName, ["strict"] = true, ["schema"] = schema },
            },
            ["max_completion_tokens"] = maxTokens,
            ["reasoning_effort"] = reasoningEffort,
        };

        var (status, text) = await SendAsync(body, ct);

        // 不同 gpt-5 版本支援的 reasoning_effort 值不同（例如 minimal），不支援時改用模型預設值重試一次
        if (status == HttpStatusCode.BadRequest && text.Contains("reasoning_effort", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning("Deployment does not accept reasoning_effort={Effort}; retrying with model default", reasoningEffort);
            body.Remove("reasoning_effort");
            (status, text) = await SendAsync(body, ct);
        }

        if (status != HttpStatusCode.OK)
        {
            logger.LogError("Azure OpenAI returned {Status}: {Body}", (int)status, Truncate(text, 2000));
            throw new AiServiceException(status switch
            {
                HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => "Azure OpenAI 驗證失敗，請確認 ApiKey 與 Endpoint 設定。",
                HttpStatusCode.NotFound => "找不到 Azure OpenAI 部署，請確認 Endpoint 與 Deployment 名稱。",
                HttpStatusCode.TooManyRequests => "AI 服務目前請求過多，請稍後再試。",
                _ => "AI 服務暫時無法回應，請稍後再試。",
            });
        }

        var root = JsonNode.Parse(text);
        var choice = root?["choices"]?[0];
        var content = choice?["message"]?["content"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(content))
        {
            var reason = choice?["finish_reason"]?.GetValue<string>();
            var refusal = choice?["message"]?["refusal"]?.GetValue<string>();
            logger.LogError("Empty AI content. finish_reason={Reason}, refusal={Refusal}", reason, refusal);
            throw new AiServiceException(reason == "length" ? "AI 回應過長被截斷，請把需求描述得更精簡再試一次。" : "AI 沒有回傳結果，請換個說法再試一次。");
        }
        return content;
    }

    async Task<(HttpStatusCode Status, string Body)> SendAsync(JsonObject body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, BuildUrl())
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("api-key", _opt.ApiKey);
        try
        {
            using var response = await http.SendAsync(request, ct);
            return (response.StatusCode, await response.Content.ReadAsStringAsync(ct));
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new AiServiceException("AI 回應逾時，請稍後再試。", ex);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Cannot reach Azure OpenAI endpoint");
            throw new AiServiceException("無法連線到 Azure OpenAI，請確認 Endpoint 設定與網路連線。", ex);
        }
    }

    string BuildUrl()
    {
        var endpoint = _opt.Endpoint.TrimEnd('/');
        return string.IsNullOrWhiteSpace(_opt.ApiVersion) || _opt.ApiVersion == "v1"
            ? $"{endpoint}/openai/v1/chat/completions"
            : $"{endpoint}/openai/deployments/{Uri.EscapeDataString(_opt.Deployment)}/chat/completions?api-version={Uri.EscapeDataString(_opt.ApiVersion)}";
    }

    T Deserialize<T>(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, Json) ?? throw new JsonException("null result");
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "Cannot parse AI JSON: {Json}", Truncate(json, 2000));
            throw new AiServiceException("AI 回傳的格式不正確，請再試一次。", ex);
        }
    }

    static string Truncate(string s, int max) => s.Length <= max ? s : s[..max] + "…";
}
