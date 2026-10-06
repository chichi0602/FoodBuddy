using System.Text.Json.Nodes;

namespace FoodBuddy.Api.Services;

/// <summary>
/// 結構化輸出（json_schema, strict）用的 Schema。
/// strict 模式要求所有欄位都列在 required，選填欄位以 null 型別表示。
/// </summary>
internal static class AiSchemas
{
    public static readonly string[] Cuisines =
        ["日式", "韓式", "台式", "中式", "西式", "義式", "燒肉", "火鍋", "拉麵", "牛排", "咖啡", "甜點", "飲料", "小吃"];

    public static readonly string[] MealTimes = ["breakfast", "lunch", "teatime", "dinner", "lateNight"];

    public static readonly string[] PriceRanges = ["under200", "200to500", "500to1000", "over1000"];

    static JsonObject Str(string description) => new() { ["type"] = "string", ["description"] = description };

    static JsonObject NullableStr(string description) =>
        new() { ["type"] = new JsonArray("string", "null"), ["description"] = description };

    static JsonObject NullableInt(string description) =>
        new() { ["type"] = new JsonArray("integer", "null"), ["description"] = description };

    static JsonObject StrArray(string description) =>
        new() { ["type"] = "array", ["items"] = new JsonObject { ["type"] = "string" }, ["description"] = description };

    static JsonObject NullableEnum(string[] values, string description)
    {
        var e = new JsonArray();
        foreach (var v in values) e.Add(v);
        e.Add(null);
        return new() { ["type"] = new JsonArray("string", "null"), ["enum"] = e, ["description"] = description };
    }

    static JsonObject Obj(JsonObject properties)
    {
        var required = new JsonArray();
        foreach (var (key, _) in properties) required.Add(key);
        return new()
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = required,
            ["additionalProperties"] = false,
        };
    }

    public static JsonObject Conditions() => Obj(new JsonObject
    {
        ["summary"] = Str("用一句繁體中文重述使用者需求"),
        ["country"] = NullableStr("國家，例如 台灣；未提及為 null"),
        ["city"] = NullableStr("城市或縣的正式全名，例如 高雄市、新竹縣；未提及為 null"),
        ["district"] = NullableStr("行政區正式全名，例如 左營區、中西區；未提及為 null"),
        ["landmark"] = NullableStr("地標或商圈，例如 高雄巨蛋、信義商圈；未提及為 null"),
        ["cuisines"] = StrArray($"料理類型，優先使用這些分類：{string.Join("、", Cuisines)}；都不符合時可用簡短中文自訂"),
        ["mealTime"] = NullableEnum(MealTimes, "用餐時段"),
        ["people"] = NullableInt("用餐人數"),
        ["budgetPerPerson"] = NullableInt("每人預算（新台幣元）"),
        ["keywords"] = StrArray("其他需求關鍵字，例如 安靜、適合約會、有停車位、想吃牛肉湯"),
    });

    static JsonObject RecommendationItem() => Obj(new JsonObject
    {
        ["name"] = Str("店家名稱"),
        ["city"] = NullableStr("城市正式全名"),
        ["district"] = NullableStr("行政區正式全名"),
        ["address"] = NullableStr("地址；不確定時一定要填 null，不可猜測"),
        ["placeType"] = NullableStr("店家類型，例如 餐廳、小吃攤、咖啡廳"),
        ["cuisines"] = StrArray($"料理類型，優先使用：{string.Join("、", Cuisines)}"),
        ["priceRange"] = NullableEnum(PriceRanges, "每人價格區間"),
        ["estimatedPricePerPerson"] = NullableInt("每人大約消費（新台幣元）"),
        ["reputation"] = NullableStr("網路上的整體評價摘要"),
        ["recommendedDishes"] = StrArray("推薦餐點"),
        ["reason"] = Str("為什麼推薦給這位使用者，需對應使用者的條件"),
        ["pros"] = StrArray("優點"),
        ["cons"] = StrArray("可能的缺點"),
        ["suitableFor"] = NullableStr("適合的族群或情境"),
        ["matchScore"] = new JsonObject { ["type"] = "integer", ["description"] = "符合使用者條件的程度 0 到 100" },
    });

    public static JsonObject Recommendations() => Obj(new JsonObject
    {
        ["recommendations"] = new JsonObject { ["type"] = "array", ["items"] = RecommendationItem() },
    });
}
