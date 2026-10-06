namespace FoodBuddy.Api.Options;

public class OsmOptions
{
    public const string SectionName = "Osm";

    /// <summary>Nominatim 使用政策要求可辨識的 User-Agent</summary>
    public string UserAgent { get; set; } = "FoodBuddy/0.1";
    public string NominatimUrl { get; set; } = "https://nominatim.openstreetmap.org";
    /// <summary>依序嘗試，前一個失敗才用下一個</summary>
    public string[] OverpassUrls { get; set; } = ["https://overpass-api.de/api/interpreter"];
}
