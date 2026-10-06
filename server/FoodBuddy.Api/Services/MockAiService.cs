using System.Text.RegularExpressions;
using FoodBuddy.Api.Models;

namespace FoodBuddy.Api.Services;

/// <summary>
/// 未設定 Azure OpenAI 時使用的示範服務：以簡單規則解析需求，並產生明顯標示為示範的店家，
/// 讓前端在沒有金鑰時也能走完整個流程。
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

    public async Task<IReadOnlyList<Recommendation>> RecommendAsync(
        string query, SearchConditions c, IReadOnlyList<string> excludeNames, CancellationToken ct)
    {
        await Task.Delay(900, ct);

        var area = c.District ?? c.City ?? "附近";
        var cuisine = c.Cuisines.FirstOrDefault() ?? "台式";
        var budget = c.BudgetPerPerson ?? 400;
        string Price(int v) => v < 200 ? "under200" : v <= 500 ? "200to500" : v <= 1000 ? "500to1000" : "over1000";

        // 準備 10 個名稱，「換一批」排除前 5 間後仍有新的示範店
        var items = new[]
        {
            ("食堂", 96, budget, "距離搜尋地區近、價格符合預算"),
            ("小館", 88, budget - 100, "在地人常去，CP 值高"),
            ("本店", 81, budget + 150, "網路評價穩定，適合多人聚餐"),
            ("屋台", 74, budget - 200, "營業到較晚，適合臨時決定"),
            ("別館", 65, budget + 400, "環境安靜，價格稍微超出預算"),
            ("工房", 92, budget + 50, "主廚料理口碑好，份量足"),
            ("横丁", 85, budget - 50, "巷弄老店，價格實惠"),
            ("亭", 79, budget + 100, "座位寬敞，適合聚餐"),
            ("家", 70, budget - 150, "家常口味，出餐快"),
            ("坊", 62, budget + 300, "裝潢有特色，適合拍照"),
        };

        return items
            .Select(i => (Name: $"示範・{area}{cuisine}{i.Item1}", i.Item2, Price: Math.Max(i.Item3, 80), i.Item4))
            .Where(i => !excludeNames.Contains(i.Name))
            .Take(5)
            .Select(i => new Recommendation(
                Name: i.Name,
                City: c.City,
                District: c.District,
                Address: null,
                PlaceType: "餐廳",
                Cuisines: [cuisine],
                PriceRange: Price(i.Price),
                EstimatedPricePerPerson: i.Price,
                Reputation: "這是示範資料，設定 Azure OpenAI 金鑰後會顯示真實推薦。",
                RecommendedDishes: ["招牌套餐", "季節限定"],
                Reason: $"{i.Item4}，符合「{c.Summary.Replace("（示範解析）", "")}」的需求。",
                Pros: ["示範優點：份量足", "示範優點：出餐快"],
                Cons: ["示範缺點：假日需排隊"],
                SuitableFor: c.People is > 2 ? "多人聚餐" : "一般用餐",
                MatchScore: i.Item2))
            .ToList();
    }

    [GeneratedRegex(@"(?:[市縣])?([一-龥]{2})區")]
    private static partial Regex DistrictRegex();

    [GeneratedRegex(@"(\d+|[一兩二三四五六七八九十])\s*(?:個)?人")]
    private static partial Regex PeopleRegex();

    [GeneratedRegex(@"(\d{2,5})\s*(?:元|塊)")]
    private static partial Regex BudgetRegex();
}
