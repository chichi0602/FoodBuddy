namespace FoodBuddy.Api.Services.Places;

public record GeoPoint(double Lat, double Lng);

/// <summary>搜尋中心與範圍</summary>
public record SearchArea(double Lat, double Lng, string Label, int RadiusMeters);

/// <summary>OpenStreetMap 上的真實店家</summary>
public record PlaceCandidate(
    string Id,
    string Name,
    double Lat,
    double Lng,
    string? Address,
    string Amenity,
    string? Cuisine,
    string? OpeningHours,
    string? Phone,
    string? Website,
    int DistanceMeters,
    // OSM 料理標籤或店名是否符合使用者想吃的料理
    bool CuisineMatched);

public interface IPlaceSearchService
{
    /// <summary>把條件中的地點轉成座標；找不到回傳 null</summary>
    Task<SearchArea?> ResolveAreaAsync(string? country, string? city, string? district, string? landmark, CancellationToken ct);

    /// <summary>取得範圍內的餐飲店家，料理相符者優先、再依距離排序</summary>
    Task<IReadOnlyList<PlaceCandidate>> SearchAsync(SearchArea area, IReadOnlyList<string> cuisines, IReadOnlyList<string> keywords, CancellationToken ct);
}

public class PlaceSearchException(string message, Exception? inner = null) : Exception(message, inner);
