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
        ["keywords"] = StrArray("其他需求關鍵字，只寫名詞，例如 牛肉湯、壽司、安靜、適合約會、有停車位；不要加「想吃」「想要」等動詞"),
    });

    /// <summary>candidateId 以 enum 限定為候選清單中的 id，模型無法產生清單外的店家</summary>
    static JsonObject AnalysisItem(IEnumerable<string> candidateIds)
    {
        var ids = new JsonArray();
        foreach (var id in candidateIds) ids.Add(id);
        return Obj(new JsonObject
        {
            ["candidateId"] = new JsonObject { ["type"] = "string", ["enum"] = ids, ["description"] = "候選店家的 id" },
            ["placeType"] = NullableStr("店家類型，例如 餐廳、小吃店、咖啡廳"),
            ["cuisines"] = StrArray($"料理類型，優先使用：{string.Join("、", Cuisines)}"),
            ["priceRange"] = NullableEnum(PriceRanges, "每人價格區間；不清楚填 null"),
            ["estimatedPricePerPerson"] = NullableInt("每人大約消費（新台幣元）；不清楚填 null"),
            ["reputation"] = NullableStr("你所知道的網路評價摘要；不認識這間店就填 null"),
            ["recommendedDishes"] = StrArray("推薦餐點；不認識這間店就給空陣列"),
            ["reason"] = Str("為什麼推薦給這位使用者，需對應使用者的條件"),
            ["pros"] = StrArray("優點"),
            ["cons"] = StrArray("可能的缺點"),
            ["suitableFor"] = NullableStr("適合的族群或情境"),
            ["preferenceReason"] = NullableStr("只用於地圖新店：明顯符合使用者口味時，寫具體依據（例如「你常收藏拉麵店，這間是豚骨拉麵」）；否則 null。收藏的店一律 null"),
            ["matchScore"] = new JsonObject { ["type"] = "integer", ["description"] = "符合使用者條件的程度 0 到 100" },
        });
    }

    public static JsonObject TasteInsight() => Obj(new JsonObject
    {
        ["summary"] = Str("2～3 句話描述使用者的飲食口味與習慣，用「你」稱呼"),
        ["highlights"] = StrArray("3～5 個具體觀察，例如「最常吃拉麵，5 次到訪有 4 次給 4 星以上」"),
        ["suggestions"] = StrArray("2～3 個下次可以嘗試的方向，要和口味相關但帶點新鮮感"),
    });

    public static JsonObject Analyses(IEnumerable<string> candidateIds) => Obj(new JsonObject
    {
        ["recommendations"] = new JsonObject { ["type"] = "array", ["items"] = AnalysisItem(candidateIds) },
    });
}
