using System.Text.RegularExpressions;
using FoodBuddy.Api.Models;
using FoodBuddy.Api.Services.Places;

namespace FoodBuddy.Api.Services;

/// <summary>
/// 未設定 Azure OpenAI 時使用的示範服務：以簡單規則解析需求，並直接依料理相符與距離排序真實候選店家，
/// 讓沒有金鑰時也能走完整個流程。
/// </summary>
public partial class MockAiService : IAiService
{
    public bool IsMock => true;

    static readonly (string Pattern, string City)[] Cities =
    [
        ("台北|臺北", "台北市"), ("新北", "新北市"), ("桃園", "桃園市"), ("台中|臺中", "台中市"),
        ("台南|臺南", "台南市"), ("高雄", "高雄市"), ("基隆", "基隆市"), ("新竹", "新竹市"),
        ("嘉義", "嘉義市"), ("宜蘭", "宜蘭縣"), ("花蓮", "花蓮縣"), ("台東|臺東", "台東縣"),
    ];

    static readonly (string Pattern, string District)[] Areas =
    [
        ("左營", "左營區"), ("巨蛋", "左營區"), ("中西區", "中西區"), ("信義", "信義區"), ("大安", "大安區"), ("中山", "中山區"),
    ];

    static readonly Dictionary<string, string> CuisineHints = new()
    {
        ["牛肉湯"] = "小吃", ["燒烤"] = "燒肉", ["壽司"] = "日式", ["丼"] = "日式", ["義大利麵"] = "義式",
        ["披薩"] = "義式", ["蛋糕"] = "甜點", ["手搖"] = "飲料", ["鍋"] = "火鍋",
    };

    static readonly Dictionary<string, int> ChineseNumbers = new()
    {
        ["一"] = 1, ["兩"] = 2, ["二"] = 2, ["三"] = 3, ["四"] = 4, ["五"] = 5, ["六"] = 6, ["七"] = 7, ["八"] = 8, ["九"] = 9, ["十"] = 10,
    };

    public async Task<SearchConditions> ParseAsync(string query, CancellationToken ct)
    {
        await Task.Delay(500, ct);

        var city = Cities.FirstOrDefault(c => Regex.IsMatch(query, c.Pattern)).City;
        var district = DistrictRegex().Match(query) is { Success: true } m ? m.Groups[1].Value + "區" : null;
        district ??= Areas.FirstOrDefault(a => query.Contains(a.Pattern)).District;
        var landmark = query.Contains("巨蛋") ? "高雄巨蛋" : null;

        var cuisines = AiSchemas.Cuisines.Where(query.Contains)
            .Concat(CuisineHints.Where(h => query.Contains(h.Key)).Select(h => h.Value))
            .Distinct()
            .ToList();

        string? mealTime =
            query.Contains("早餐") || query.Contains("早上") ? "breakfast" :
            query.Contains("午餐") || query.Contains("中午") ? "lunch" :
            query.Contains("下午茶") ? "teatime" :
            query.Contains("宵夜") ? "lateNight" :
            query.Contains("晚餐") || query.Contains("晚上") ? "dinner" : null;

        int? people = PeopleRegex().Match(query) is { Success: true } p
            ? int.TryParse(p.Groups[1].Value, out var n) ? n : ChineseNumbers.GetValueOrDefault(p.Groups[1].Value)
            : null;
        int? budget = BudgetRegex().Match(query) is { Success: true } b ? int.Parse(b.Groups[1].Value) : null;

        var keywords = query.Contains("牛肉湯") ? new List<string> { "牛肉湯" } : [];

        return new SearchConditions(
            Summary: $"（示範解析）{query}",
            Country: city is null ? null : "台灣",
            City: city,
            District: district,
            Landmark: landmark,
            Cuisines: cuisines,
            MealTime: mealTime,
            People: people is 0 ? null : people,
            BudgetPerPerson: budget,
            Keywords: keywords);
    }

    public async Task<IReadOnlyList<AiAnalysis>> RankAsync(
        string query, SearchConditions c, IReadOnlyList<PlaceCandidate> candidates, CancellationToken ct)
    {
        await Task.Delay(600, ct);

        // 候選已依「料理相符 → 距離」排序，示範模式直接取前 5 間
        return candidates.Take(5).Select((p, i) =>
        {
            var reasons = new List<string>();
            if (p.CuisineMatched) reasons.Add("店名或料理分類符合你想吃的");
            reasons.Add($"距離搜尋中心約 {p.DistanceMeters} 公尺");
            if (p.OpeningHours is not null) reasons.Add("有標示營業時間");
            return new AiAnalysis(
                CandidateId: p.Id,
                PlaceType: p.Amenity switch { "cafe" => "咖啡廳", "fast_food" => "速食", "ice_cream" => "冰品甜點", "bar" or "pub" => "酒吧", _ => "餐廳" },
                Cuisines: c.Cuisines.Count > 0 && p.CuisineMatched ? [c.Cuisines[0]] : [],
                PriceRange: null,
                EstimatedPricePerPerson: null,
                Reputation: null,
                RecommendedDishes: [],
                Reason: $"（示範排序）{string.Join("、", reasons)}。設定 Azure OpenAI 金鑰後會由 AI 分析。",
                Pros: p.CuisineMatched ? ["符合料理條件"] : [],
                Cons: p.CuisineMatched ? [] : ["料理類型未確認"],
                SuitableFor: null,
                MatchScore: Math.Max(40, (p.CuisineMatched ? 95 : 70) - i * 5));
        }).ToList();
    }

    [GeneratedRegex(@"(?:[市縣])?([一-龥]{2})區")]
    private static partial Regex DistrictRegex();

    [GeneratedRegex(@"(\d+|[一兩二三四五六七八九十])\s*(?:個)?人")]
    private static partial Regex PeopleRegex();

    [GeneratedRegex(@"(\d{2,5})\s*(?:元|塊)")]
    private static partial Regex BudgetRegex();
}
