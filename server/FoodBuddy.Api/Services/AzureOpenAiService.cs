using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FoodBuddy.Api.Models;
using FoodBuddy.Api.Options;
using FoodBuddy.Api.Services.Places;
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

    const string RankPrompt = """
        你是美食推薦助理。依使用者需求，從兩份清單中挑店並寫分析：
        「我的收藏」是使用者自己存過、位於搜尋範圍內的店；「地圖店家」是 OpenStreetMap 上真實存在、使用者還沒收藏的店。
        - 只能從清單中挑選，用 candidateId 指定；不可推薦清單以外的店。
        - 「我的收藏」：只挑真的符合這次需求的（最多 5 間），沒有就不挑；reason 用「你之前收藏的這間…」的語氣，說明為什麼這次適合。
        - 「地圖店家」：挑出最適合的最多 5 間。如果某間明顯符合使用者口味摘要（常收藏的料理、偏好價位、高評分的店類型），
          在 preferenceReason 寫出具體依據；只是剛好符合需求、和口味無關的就填 null，不要硬套。
        - 避開使用者標記不推薦的料理類型與店家。
        - 「料理」欄是地圖標籤，可能缺漏，請同時依店名判斷。認識的店可以寫評價與推薦餐點，不認識就填 null 或空陣列，不可捏造；價格不確定填 null。
        - reason 要具體對應使用者條件（料理、距離、時段、預算、人數、關鍵字）；pros、cons 各 1～3 點，簡短。
        - 符合的店不足時寧可少給；matchScore 反映符合程度。
        - 給使用者看的文字不要提到「OSM」「標籤」「候選清單」「id」等系統用語，距離用「約 1.4 公里」「步行約 5 分鐘」這類說法。
        - 全部使用繁體中文。
        """;

    public async Task<SearchConditions> ParseAsync(string query, CancellationToken ct)
    {
        var json = await CompleteAsync(ParsePrompt, query, "search_conditions", AiSchemas.Conditions(), "minimal", 2000, ct);
        return Deserialize<SearchConditions>(json);
    }

    public async Task<IReadOnlyList<AiAnalysis>> RankAsync(
        string query,
        SearchConditions conditions,
        IReadOnlyList<PlaceCandidate> candidates,
        IReadOnlyList<SavedCandidate> saved,
        TasteProfile? profile,
        CancellationToken ct)
    {
        // 精簡的表格格式，控制 token 數
        var mapLines = candidates.Select(p =>
            $"{p.Id} | {p.Name} | {p.Amenity} | {p.Cuisine ?? "-"} | {p.DistanceMeters}m | {p.OpeningHours ?? "-"}");
        var savedLines = saved.Select(s =>
            $"{s.Id} | {s.Place.Name} | {(s.Place.Cuisines.Count > 0 ? string.Join("/", s.Place.Cuisines) : "-")} | " +
            $"{(s.DistanceMeters is { } d ? $"{d}m" : "-")} | {string.Join("/", s.Place.Statuses)} | {(s.Place.Rating is { } r ? $"{r}★" : "-")}");

        var user = $"""
            使用者需求：{query}

            已解析條件（JSON）：
            {JsonSerializer.Serialize(conditions, Json)}

            使用者口味摘要（JSON，null 代表收藏太少還看不出偏好）：
            {(profile is null ? "null" : JsonSerializer.Serialize(profile, Json))}

            我的收藏（id | 店名 | 料理 | 距離 | 狀態 | 評分）：
            {(saved.Count == 0 ? "（無）" : string.Join("\n", savedLines))}

            地圖店家（id | 店名 | 類型 | 料理 | 距離 | 營業時間）：
            {(candidates.Count == 0 ? "（無）" : string.Join("\n", mapLines))}
            """;
        var ids = candidates.Select(c => c.Id).Concat(saved.Select(s => s.Id));
        var json = await CompleteAsync(RankPrompt, user, "recommendations", AiSchemas.Analyses(ids), "low", 10000, ct);
        return Deserialize<AnalysisList>(json).Recommendations;
    }

    record AnalysisList(IReadOnlyList<AiAnalysis> Recommendations);

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
