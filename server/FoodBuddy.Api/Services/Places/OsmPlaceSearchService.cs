using System.Globalization;
using System.Text.RegularExpressions;
using System.Text.Json;
using FoodBuddy.Api.Options;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace FoodBuddy.Api.Services.Places;

/// <summary>
/// 以 OpenStreetMap 取得真實店家：Nominatim 把地名轉座標，Overpass 查詢範圍內的餐飲店。
/// 兩個都是公益服務，因此結果都會快取，Nominatim 也限制每秒最多一次。
/// </summary>
public partial class OsmPlaceSearchService(
    HttpClient http, IMemoryCache cache, IOptions<OsmOptions> options, ILogger<OsmPlaceSearchService> logger)
    : IPlaceSearchService
{
    const int MaxCandidates = 40;
    const string Amenities = "restaurant|cafe|fast_food|food_court|ice_cream|bar|pub";

    static readonly SemaphoreSlim NominatimGate = new(1, 1);
    static DateTime _lastNominatimCall = DateTime.MinValue;

    /// <summary>中文料理分類 → OSM cuisine 值與店名關鍵字</summary>
    static readonly Dictionary<string, (string[] Osm, string[] Names)> CuisineMap = new()
    {
        ["日式"] = (["japanese", "sushi", "ramen", "udon", "soba", "donburi", "tonkatsu", "yakitori", "izakaya", "teppanyaki"], ["日式", "日本", "壽司", "拉麵", "丼", "定食", "居酒屋", "らーめん", "和風"]),
        ["韓式"] = (["korean"], ["韓式", "韓國", "韓"]),
        ["台式"] = (["taiwanese", "local", "beef_noodle", "noodle", "rice"], ["台式", "小吃", "肉燥", "滷肉", "牛肉麵", "擔仔麵"]),
        ["中式"] = (["chinese", "cantonese", "sichuan", "dim_sum", "dumpling", "noodle"], ["中式", "川菜", "港式", "飲茶", "餃", "麵"]),
        ["西式"] = (["western", "american", "burger", "steak_house", "french", "brunch", "sandwich"], ["西式", "早午餐", "漢堡", "排餐"]),
        ["義式"] = (["italian", "pizza", "pasta"], ["義式", "義大利", "披薩", "pizza"]),
        ["燒肉"] = (["barbecue", "yakiniku", "bbq"], ["燒肉", "燒烤", "烤肉"]),
        ["火鍋"] = (["hot_pot", "shabu-shabu", "shabu_shabu", "sukiyaki"], ["火鍋", "鍋", "涮涮", "壽喜燒"]),
        ["拉麵"] = (["ramen"], ["拉麵", "らーめん", "ラーメン", "ramen"]),
        ["牛排"] = (["steak_house", "steak"], ["牛排", "steak"]),
        ["咖啡"] = (["coffee_shop", "coffee"], ["咖啡", "café", "cafe", "coffee"]),
        ["甜點"] = (["dessert", "cake", "ice_cream", "pastry", "waffle", "crepe", "bakery"], ["甜點", "蛋糕", "冰", "甜", "鬆餅"]),
        ["飲料"] = (["bubble_tea", "tea", "juice", "drinks"], ["茶", "飲", "果汁"]),
        ["小吃"] = (["taiwanese", "local", "street_food", "noodle", "dumpling", "rice"], ["小吃", "肉圓", "湯", "飯", "麵", "粿"]),
    };

    readonly OsmOptions _opt = options.Value;

    public async Task<SearchArea?> ResolveAreaAsync(
        string? country, string? city, string? district, string? landmark, CancellationToken ct)
    {
        var inTaiwan = country is null or "台灣" or "臺灣" or "Taiwan";
        // 由精確到粗略依序嘗試
        var attempts = new List<(string Query, string Label, int Radius)>();
        if (!string.IsNullOrWhiteSpace(landmark))
            attempts.Add((string.Join(", ", new[] { landmark, district, city }.Where(s => !string.IsNullOrWhiteSpace(s))), landmark!, 1500));
        if (!string.IsNullOrWhiteSpace(district))
            attempts.Add((string.Join(", ", new[] { district, city }.Where(s => !string.IsNullOrWhiteSpace(s))), district!, 2500));
        if (!string.IsNullOrWhiteSpace(city))
            attempts.Add((city!, city!, 4000));

        foreach (var (query, label, radius) in attempts)
        {
            var point = await GeocodeAsync(query, inTaiwan ? "tw" : null, ct);
            if (point is not null) return new SearchArea(point.Lat, point.Lng, label, radius);
        }
        return null;
    }

    async Task<GeoPoint?> GeocodeAsync(string query, string? countryCode, CancellationToken ct)
    {
        var key = $"geo:{countryCode}:{query}";
        if (cache.TryGetValue(key, out GeoPoint? cached)) return cached;

        var url = $"{_opt.NominatimUrl.TrimEnd('/')}/search?format=jsonv2&limit=1&accept-language=zh-TW&q={Uri.EscapeDataString(query)}"
                  + (countryCode is null ? "" : $"&countrycodes={countryCode}");

        await NominatimGate.WaitAsync(ct);
        try
        {
            // Nominatim 使用政策：每秒最多一次請求
            var wait = _lastNominatimCall.AddMilliseconds(1100) - DateTime.UtcNow;
            if (wait > TimeSpan.Zero) await Task.Delay(wait, ct);
            _lastNominatimCall = DateTime.UtcNow;

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.UserAgent.ParseAdd(_opt.UserAgent);
            using var response = await http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Nominatim returned {Status} for {Query}", (int)response.StatusCode, query);
                throw new PlaceSearchException("地點查詢服務暫時無法使用，請稍後再試。");
            }
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            GeoPoint? point = null;
            if (doc.RootElement.GetArrayLength() > 0)
            {
                var first = doc.RootElement[0];
                point = new GeoPoint(ParseDouble(first.GetProperty("lat")), ParseDouble(first.GetProperty("lon")));
            }
            cache.Set(key, point, TimeSpan.FromHours(24));
            return point;
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Cannot reach Nominatim");
            throw new PlaceSearchException("無法連線到地點查詢服務，請確認網路連線。", ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new PlaceSearchException("地點查詢逾時，請稍後再試。", ex);
        }
        finally
        {
            NominatimGate.Release();
        }
    }

    public async Task<IReadOnlyList<PlaceCandidate>> SearchAsync(
        SearchArea area, IReadOnlyList<string> cuisines, IReadOnlyList<string> keywords, CancellationToken ct)
    {
        var all = await FetchAreaAsync(area, ct);

        // 「想吃牛肉湯」→「牛肉湯」，避免動詞讓店名比對失敗
        var wantKeywords = keywords
            .Select(k => FillerWords().Replace(k.Trim(), ""))
            .Where(k => k.Length >= 2)
            .ToList();
        var wantOsm = cuisines.SelectMany(c => CuisineMap.TryGetValue(c, out var m) ? m.Osm : []).ToHashSet();
        var wantNames = cuisines.SelectMany(c => CuisineMap.TryGetValue(c, out var m) ? m.Names : [c]).Distinct().ToList();
        var wantCafe = cuisines.Contains("咖啡");
        var wantIceCream = cuisines.Contains("甜點");

        // 分數：店名含使用者的關鍵字（例如「牛肉湯」）最優先，其次是 OSM 料理標籤，最後是分類的一般店名提示（例如「麵」）
        int Score(PlaceCandidate p)
        {
            if (wantKeywords.Any(k => p.Name.Contains(k, StringComparison.OrdinalIgnoreCase))) return 3;
            var osmCuisines = (p.Cuisine ?? "").Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            if (osmCuisines.Any(wantOsm.Contains) || (wantCafe && p.Amenity == "cafe") || (wantIceCream && p.Amenity == "ice_cream"))
                return 2;
            return wantNames.Any(n => p.Name.Contains(n, StringComparison.OrdinalIgnoreCase)) ? 1 : 0;
        }

        return all
            .Select(p => (Place: p, Score: Score(p)))
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Place.DistanceMeters)
            .Take(MaxCandidates)
            .Select(x => x.Place with { CuisineMatched = x.Score > 0 })
            .ToList();
    }

    async Task<List<PlaceCandidate>> FetchAreaAsync(SearchArea area, CancellationToken ct)
    {
        var key = $"overpass:{area.Lat:F3}:{area.Lng:F3}:{area.RadiusMeters}";
        if (cache.TryGetValue(key, out List<PlaceCandidate>? cached)) return cached!;

        var lat = area.Lat.ToString(CultureInfo.InvariantCulture);
        var lng = area.Lng.ToString(CultureInfo.InvariantCulture);
        var ql = $"[out:json][timeout:25];nwr[\"amenity\"~\"^({Amenities})$\"][\"name\"](around:{area.RadiusMeters},{lat},{lng});out center tags 400;";

        var json = await QueryOverpassAsync(ql, ct);
        var places = ParseElements(json, area);
        cache.Set(key, places, TimeSpan.FromMinutes(30));
        return places;
    }

    async Task<string> QueryOverpassAsync(string ql, CancellationToken ct)
    {
        // 主站失敗時換備援站；全部失敗再重試主站一次
        var urls = _opt.OverpassUrls.Append(_opt.OverpassUrls.First()).ToList();
        for (var i = 0; i < urls.Count; i++)
        {
            if (i == urls.Count - 1) await Task.Delay(2000, ct);
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, urls[i])
                {
                    Content = new FormUrlEncodedContent([new KeyValuePair<string, string>("data", ql)]),
                };
                request.Headers.UserAgent.ParseAdd(_opt.UserAgent);
                using var response = await http.SendAsync(request, ct);
                var body = await response.Content.ReadAsStringAsync(ct);
                // Overpass 忙碌或逾時時會回傳 HTML/XML 錯誤頁
                if (response.IsSuccessStatusCode && body.TrimStart().StartsWith('{')) return body;
                logger.LogWarning("Overpass {Url} returned {Status}", urls[i], (int)response.StatusCode);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
            {
                logger.LogWarning(ex, "Overpass {Url} failed", urls[i]);
            }
        }
        throw new PlaceSearchException("地圖店家資料服務暫時忙碌，請稍後再試。");
    }

    static List<PlaceCandidate> ParseElements(string json, SearchArea area)
    {
        using var doc = JsonDocument.Parse(json);
        var result = new List<PlaceCandidate>();
        var seen = new HashSet<string>();
        foreach (var el in doc.RootElement.GetProperty("elements").EnumerateArray())
        {
            if (!el.TryGetProperty("tags", out var tags)) continue;
            string? Tag(string k) => tags.TryGetProperty(k, out var v) ? v.GetString() : null;

            var name = Tag("name:zh-Hant") ?? Tag("name:zh") ?? Tag("name");
            if (string.IsNullOrWhiteSpace(name)) continue;

            var (lat, lng) = el.TryGetProperty("lat", out var la)
                ? (la.GetDouble(), el.GetProperty("lon").GetDouble())
                : el.TryGetProperty("center", out var c)
                    ? (c.GetProperty("lat").GetDouble(), c.GetProperty("lon").GetDouble())
                    : (double.NaN, double.NaN);
            if (double.IsNaN(lat)) continue;

            // 同名且位置相近（約 50 公尺）視為同一間，例如同時存在 node 與 way
            if (!seen.Add($"{name}:{lat:F3}:{lng:F3}")) continue;

            result.Add(new PlaceCandidate(
                Id: $"{el.GetProperty("type").GetString()}/{el.GetProperty("id").GetInt64()}",
                Name: name.Trim(),
                Lat: lat,
                Lng: lng,
                Address: BuildAddress(Tag),
                Amenity: Tag("amenity") ?? "restaurant",
                Cuisine: Tag("cuisine"),
                OpeningHours: Tag("opening_hours"),
                Phone: Tag("phone") ?? Tag("contact:phone"),
                Website: Tag("website") ?? Tag("contact:website") ?? Tag("url"),
                DistanceMeters: (int)Math.Round(DistanceMeters(area.Lat, area.Lng, lat, lng)),
                CuisineMatched: false));
        }
        return result;
    }

    static string? BuildAddress(Func<string, string?> tag)
    {
        if (tag("addr:full") is { } full) return full;
        var street = tag("addr:street");
        if (street is null) return null;
        var number = tag("addr:housenumber");
        if (number is not null && number.All(char.IsDigit)) number += "號";
        return $"{tag("addr:city")}{tag("addr:district")}{street}{number}";
    }

    static double ParseDouble(JsonElement e) =>
        e.ValueKind == JsonValueKind.String ? double.Parse(e.GetString()!, CultureInfo.InvariantCulture) : e.GetDouble();

    public static double DistanceMeters(double lat1, double lng1, double lat2, double lng2)
    {
        const double R = 6371000;
        static double Rad(double d) => d * Math.PI / 180;
        var dLat = Rad(lat2 - lat1);
        var dLng = Rad(lng2 - lng1);
        var h = Math.Pow(Math.Sin(dLat / 2), 2) + Math.Cos(Rad(lat1)) * Math.Cos(Rad(lat2)) * Math.Pow(Math.Sin(dLng / 2), 2);
        return 2 * R * Math.Asin(Math.Sqrt(h));
    }

    [GeneratedRegex("^(想要吃|想吃|想喝|想要|要吃|吃)")]
    private static partial Regex FillerWords();
}
