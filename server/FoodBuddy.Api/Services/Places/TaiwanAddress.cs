using System.Text.RegularExpressions;

namespace FoodBuddy.Api.Services.Places;

/// <summary>
/// Nominatim 看不懂台灣常見的「813高雄市左營區孟子路587號」寫法，
/// 但能解析「孟子路 587, 左營區, 高雄市」（由小到大、逗號分隔）。這裡負責轉換。
/// </summary>
public static partial class TaiwanAddress
{
    /// <summary>無法辨識為台灣地址時回傳 null</summary>
    public static string? ToNominatimQuery(string address)
    {
        var m = AddressPattern().Match(address.Replace(" ", "").Replace("　", ""));
        if (!m.Success) return null;

        var street = m.Groups["street"].Value + m.Groups["lane"].Value + m.Groups["alley"].Value;
        var parts = new[] { $"{street} {m.Groups["number"].Value}", m.Groups["district"].Value, m.Groups["city"].Value };
        return string.Join(", ", parts.Where(p => !string.IsNullOrWhiteSpace(p)));
    }

    // 郵遞區號（可有可無）→ 縣市 → 鄉鎮市區 → 路街（含段）→ 巷 → 弄 → 號（「之 N」忽略）
    [GeneratedRegex(@"^(?:\d{3,6})?(?<city>[^\d]{2}[市縣])?(?<district>[^\d]{1,4}?[區鄉鎮市])?(?<street>[^\d]+?(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?)(?<lane>\d+巷)?(?<alley>\d+弄)?(?<number>\d+)(?:之\d+)?號")]
    private static partial Regex AddressPattern();
}
