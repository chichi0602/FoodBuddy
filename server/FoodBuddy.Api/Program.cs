using FoodBuddy.Api.Data;
using FoodBuddy.Api.Options;
using FoodBuddy.Api.Services;
using FoodBuddy.Api.Services.Auth;
using FoodBuddy.Api.Services.Places;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod());
});

// 帳號與同步資料存在 SQLite；相對路徑以專案（部署後為網站）資料夾為準，不受 IIS 的工作目錄影響
var dbPath = builder.Configuration["Database:Path"] ?? "App_Data/foodbuddy.db";
if (!Path.IsPathRooted(dbPath)) dbPath = Path.Combine(builder.Environment.ContentRootPath, dbPath);
Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite($"Data Source={dbPath}"));

builder.Services
    .AddIdentity<AppUser, IdentityRole>(o =>
    {
        o.User.RequireUniqueEmail = true;
        o.Password.RequiredLength = 8;
        o.Password.RequireDigit = false;
        o.Password.RequireLowercase = false;
        o.Password.RequireUppercase = false;
        o.Password.RequireNonAlphanumeric = false;
        o.Lockout.MaxFailedAccessAttempts = 5;
        o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddErrorDescriber<ChineseIdentityErrorDescriber>()
    .AddDefaultTokenProviders();

// 前後端同網域，用 HttpOnly Cookie 記住登入；API 未登入回 401，不轉址
builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "FoodBuddy.Auth";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    o.ExpireTimeSpan = TimeSpan.FromDays(30);
    o.SlidingExpiration = true;
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
});

// Google 登入：有填 ClientId 與 ClientSecret 才啟用，前端依 /api/auth/providers 決定是否顯示按鈕
var google = builder.Configuration.GetSection("Authentication:Google");
if (!string.IsNullOrWhiteSpace(google["ClientId"]) && !string.IsNullOrWhiteSpace(google["ClientSecret"]))
{
    builder.Services.AddAuthentication().AddGoogle(o =>
    {
        o.ClientId = google["ClientId"]!;
        o.ClientSecret = google["ClientSecret"]!;
        o.SignInScheme = IdentityConstants.ExternalScheme;
    });
}

// Azure OpenAI 金鑰從 User Secrets 讀取；未設定時改用示範資料
var aiSection = builder.Configuration.GetSection(AzureOpenAIOptions.SectionName);
builder.Services.Configure<AzureOpenAIOptions>(aiSection);
var aiOptions = aiSection.Get<AzureOpenAIOptions>() ?? new AzureOpenAIOptions();
if (aiOptions.IsConfigured)
{
    // gpt-5 推理模型產生推薦可能需要數十秒
    builder.Services.AddHttpClient<IAiService, AzureOpenAiService>(c => c.Timeout = TimeSpan.FromSeconds(90));
}
else
{
    builder.Services.AddSingleton<IAiService, MockAiService>();
}

// OpenStreetMap 真實店家（Nominatim + Overpass）
builder.Services.AddMemoryCache();
builder.Services.Configure<OsmOptions>(builder.Configuration.GetSection(OsmOptions.SectionName));
builder.Services.AddHttpClient<IPlaceSearchService, OsmPlaceSearchService>(c => c.Timeout = TimeSpan.FromSeconds(40));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<RecommendationService>();

var app = builder.Build();

// 啟動時自動套用資料庫結構變更
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// aiConfigured 只回報 Azure OpenAI 設定是否齊全，不回傳任何金鑰內容
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", aiConfigured = aiOptions.IsConfigured }));
app.MapControllers();

app.Run();
