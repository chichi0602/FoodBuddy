using System.Text.RegularExpressions;
using FoodBuddy.Api.Services.Places;

namespace FoodBuddy.Api.Services;

/// <summary>地名與店名的寬鬆比對（與前端 utils/aiMatch.ts 的規則一致）</summary>
public static partial class AreaMatcher
{
    /// <summary>「高雄市」=「高雄」、「臺南」=「台南」</summary>
    public static string NormalizeArea(string s) => AreaSuffix().Replace(s.Trim().Replace('臺', '台'), "");

    /// <summary>未指定條件視為符合；有指定但店家沒填則不符合</summary>
    public static bool SameArea(string? want, string? value) =>
        string.IsNullOrWhiteSpace(want) ||
        (!string.IsNullOrWhiteSpace(value) && NormalizeArea(want) == NormalizeArea(value));

    public static string NormalizeName(string s) => NameNoise().Replace(s.ToLowerInvariant(), "");

    /// <summary>店名相同，或名稱互相包含且距離 100 公尺內（例如「一風堂」與「一風堂 巨蛋店」）</summary>
    public static bool IsSamePlace(string nameA, double? latA, double? lngA, string nameB, double latB, double lngB)
    {
        var a = NormalizeName(nameA);
        var b = NormalizeName(nameB);
        if (a == b) return true;
        if (Math.Min(a.Length, b.Length) < 2 || !(a.Contains(b) || b.Contains(a))) return false;
        return latA is { } la && lngA is { } lo && OsmPlaceSearchService.DistanceMeters(la, lo, latB, lngB) < 100;
    }

    [GeneratedRegex("(市區|市|縣|區|鄉|鎮)$")]
    private static partial Regex AreaSuffix();

    [GeneratedRegex(@"[\s·・()（）\-_.,，、]")]
    private static partial Regex NameNoise();
}
