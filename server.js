require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 縣市 ID 對照表 (For URL routing)
const CITY_MAP = {
  taipei: "臺北市",
  newtaipei: "新北市",
  taoyuan: "桃園市",
  taichung: "臺中市",
  tainan: "臺南市",
  kaohsiung: "高雄市",
  keelung: "基隆市",
  hsinchu_city: "新竹市",
  hsinchu_county: "新竹縣",
  miaoli: "苗栗縣",
  changhua: "彰化縣",
  nantou: "南投縣",
  yunlin: "雲林縣",
  chiayi_city: "嘉義市",
  chiayi_county: "嘉義縣",
  pingtung: "屏東縣",
  yilan: "宜蘭縣",
  hualien: "花蓮縣",
  taitung: "臺東縣",
  penghu: "澎湖縣",
  kinmen: "金門縣",
  lienchiang: "連江縣",
};

// Helper: 取得今明兩天日期字串 (YYYY-MM-DD)
const getTodayTomorrowStr = () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 格式化為 YYYY-MM-DD
  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  return {
    today: formatDate(today),
    tomorrow: formatDate(tomorrow),
  };
};

/**
 * 根據溫差指數與當日氣溫提供穿搭建議 (雙語)
 */
const getClothingAdvice = (index, maxTemp = null, minTemp = null) => {
  // 預設沒有溫度資料時的邏輯
  if (maxTemp === null || minTemp === null) {
    if (index >= 10) return {
      zh: "溫差極大！建議洋蔥式穿搭 (透氣內層+保暖外層)。",
      en: "Extreme temp diff! Onion-style dressing recommended."
    };
    if (index >= 6) return {
      zh: "日夜溫差稍大，建議攜帶薄外套。",
      en: "Large temp diff. Bringing a light jacket is advised."
    };
    return {
      zh: "溫差舒適，依氣溫穿著即可。",
      en: "Comfortable temp diff. Dress according to current temp."
    };
  }

  const maxT = parseInt(maxTemp);
  const minT = parseInt(minTemp);

  // 1. 高溫情境 (最低溫也很高，例如 26度以上)
  if (minT >= 26) {
    return {
      zh: "全天炎熱，雖有溫差但低溫仍高，建議穿著透氣散熱衣物，多補充水分。",
      en: "Hot all day! Wear breathable clothes and stay hydrated."
    };
  }

  // 2. 白天熱晚上涼
  if (maxT >= 30 && minT <= 25) {
    return {
      zh: "白天炎熱但夜間稍涼，建議短袖搭配極薄外套，方便穿脫。",
      en: "Hot day, cool night. Short sleeves with a thin jacket recommended."
    };
  }

  // 3. 溫差大 (標準洋蔥式)
  if (index >= 10) {
    return {
      zh: "溫差極大！早晚偏涼，建議洋蔥式穿搭 (透氣內層+保暖外層)。",
      en: "Extreme temp diff! Onion-style dressing recommended."
    };
  }

  // 4. 溫差稍大
  if (index >= 6) {
    return {
      zh: "日夜溫差稍大，建議攜帶薄外套。",
      en: "Large temp diff. A light jacket is recommended."
    };
  }

  // 5. 溫差小，依據最高溫給建議
  if (maxT > 30) return {
    zh: "天氣炎熱，建議穿著短袖衣物並注意防曬。",
    en: "It's hot. Short sleeves and sun protection advised."
  };
  if (maxT >= 25) return {
    zh: "氣候舒適，建議穿著短袖或薄長袖。",
    en: "Comfortable weather. Short sleeves or light long sleeves."
  };
  if (maxT >= 20) return {
    zh: "稍有涼意，建議穿著薄長袖或搭配背心。",
    en: "Slightly cool. Long sleeves or a vest recommended."
  };
  return {
    zh: "氣溫較低，建議穿著保暖衣物與外套。",
    en: "It's cold. Warm clothes and a jacket are recommended."
  };
};

/**
 * 取得指定縣市天氣預報
 * CWA 氣象資料開放平臺 API
 * 使用「一般天氣預報 - 今明 36 小時天氣預報」資料集(F - C0032-001)
 */
const getWeatherByCity = async (req, res) => {
  try {
    const cityKey = req.params.city;
    const locationName = CITY_MAP[cityKey.toLowerCase()];

    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    if (!locationName) {
      return res.status(400).json({
        error: "參數錯誤",
        message: "找不到此縣市，請檢查拼字或使用正確的縣市代碼",
        availableCities: Object.keys(CITY_MAP),
      });
    }

    // 呼叫 CWA API - 一般天氣預報（36小時）
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: locationName,
        },
      }
    );

    const locationData = response.data.records.location[0];

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得 ${locationName} 天氣資料`,
      });
    }

    // 整理天氣資料
    const weatherData = {
      city: locationData.locationName,
      cityKey: cityKey,
      updateTime: response.data.records.datasetDescription,
      forecasts: [],
    };

    // 解析天氣要素
    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {
        startTime: weatherElements[0].time[i].startTime,
        endTime: weatherElements[0].time[i].endTime,
        weather: "",
        rain: "",
        minTemp: "",
        maxTemp: "",
        comfort: "",
        windSpeed: "",
      };

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        switch (element.elementName) {
          case "Wx":
            forecast.weather = value.parameterName;
            break;
          case "PoP":
            forecast.rain = value.parameterName + "%";
            break;
          case "MinT":
            forecast.minTemp = value.parameterName + "°C";
            break;
          case "MaxT":
            forecast.maxTemp = value.parameterName + "°C";
            break;
          case "CI":
            forecast.comfort = value.parameterName;
            break;
          case "WS":
            forecast.windSpeed = value.parameterName;
            break;
        }
      });

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

/**
 * 取得健康氣象溫差提醒
 * API: F-A0085-005
 */
const getTempDiffByCity = async (req, res) => {
  try {
    const cityKey = req.params.city;
    const locationName = CITY_MAP[cityKey.toLowerCase()];

    if (!CWA_API_KEY) return res.status(500).json({ error: "API Key Missing" });
    if (!locationName) return res.status(400).json({ error: "Invalid City" });

    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-A0085-005`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: locationName,
        },
      }
    );

    const records = response.data.records;
    const locationsRoot = records.Locations || records.locations;

    let maxDiffIndex = 0;
    let maxDiffDesc = "";
    let dataFound = false;

    if (locationsRoot && locationsRoot[0]) {
      const locationData = locationsRoot[0];
      const towns = locationData.Location || locationData.location;
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];

      if (towns) {
        towns.forEach(town => {
          if (town.Time) {
            const forecasts = town.Time.filter(t => t.IssueTime && t.IssueTime.startsWith(dateStr));

            forecasts.forEach(f => {
              const el = f.WeatherElements;
              if (el && el.TemperatureDifferenceIndex) {
                const val = parseInt(el.TemperatureDifferenceIndex, 10);
                if (!isNaN(val) && val > maxDiffIndex) {
                  maxDiffIndex = val;
                  maxDiffDesc = el.TemperatureDifferenceWarning || "";
                  dataFound = true;
                }
              }
            });
          }
        });
      }
    }

    // Fallback search
    if (!dataFound && locationsRoot && locationsRoot[0]) {
      const locationData = locationsRoot[0];
      const towns = locationData.Location || locationData.location;
      if (towns) {
        towns.forEach(town => {
          town.Time?.forEach(f => {
            const el = f.WeatherElements;
            if (el && el.TemperatureDifferenceIndex) {
              const val = parseInt(el.TemperatureDifferenceIndex, 10);
              if (!isNaN(val) && val > maxDiffIndex) {
                maxDiffIndex = val;
                maxDiffDesc = el.TemperatureDifferenceWarning || "";
                dataFound = true;
              }
            }
          });
        });
      }
    }

    // 計算穿搭建議 - 此次一律抓取氣溫資料以提供精準建議
    let advice = { zh: "暫無建議", en: "No advice" }; // Default object
    if (dataFound) {
      let maxTemp = null;
      let minTemp = null;
      try {
        // 呼叫 F-C0032-001 取得溫氣溫
        const weatherRes = await axios.get(
          `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
          {
            params: {
              Authorization: CWA_API_KEY,
              locationName: locationName,
            },
          }
        );

        const loc = weatherRes.data.records.location[0];
        if (loc) {
          const maxTEl = loc.weatherElement.find(e => e.elementName === 'MaxT');
          const minTEl = loc.weatherElement.find(e => e.elementName === 'MinT');

          if (maxTEl && maxTEl.time && maxTEl.time[0]) {
            maxTemp = maxTEl.time[0].parameter.parameterName;
          }
          if (minTEl && minTEl.time && minTEl.time[0]) {
            minTemp = minTEl.time[0].parameter.parameterName;
          }
        }
      } catch (err) {
        console.error("Fetch Temp for Advice Error:", err.message);
        // Ignore error
      }

      advice = getClothingAdvice(maxDiffIndex, maxTemp, minTemp);
    }

    res.json({
      success: true,
      data: {
        tempDiffIndex: dataFound ? maxDiffIndex : null,
        tempDiffWarning: maxDiffDesc,
        locationName: locationName,
        clothingAdvice: advice, // Now an object {zh, en}
        desc: dataFound ? `最大溫差指數 ${maxDiffIndex}` : "暫無資料"
      },
    });
  } catch (error) {
    console.error("温差資料取得失敗", error.message);
    res.status(500).json({ error: "Fetch Failed", details: error.message });
  }
};

/**
 * 取得日出日沒資料
 * API: A-B0062-001
 */
const getSunScheduleByCity = async (req, res) => {
  try {
    const cityKey = req.params.city;
    const locationName = CITY_MAP[cityKey.toLowerCase()];

    if (!CWA_API_KEY) return res.status(500).json({ error: "API Key Missing" });
    if (!locationName) return res.status(400).json({ error: "Invalid City" });

    const { today, tomorrow } = getTodayTomorrowStr();

    // 天文資料有時使用 CountyName 或 Location
    // 這裡嘗試直接帶入參數過濾，若 API 不支援過濾則在程式內過濾
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/A-B0062-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          CountyName: locationName,
          Date: today
        },
      }
    );

    res.json({
      success: true,
      data: response.data.records,
    });
  } catch (error) {
    console.error("日出資料取得失敗", error.message);
    res.status(500).json({ error: "Fetch Failed", details: error.message });
  }
};

/**
 * 取得月出月沒資料
 * API: A-B0063-001
 */
const getMoonScheduleByCity = async (req, res) => {
  try {
    const cityKey = req.params.city;
    const locationName = CITY_MAP[cityKey.toLowerCase()];

    if (!CWA_API_KEY) return res.status(500).json({ error: "API Key Missing" });
    if (!locationName) return res.status(400).json({ error: "Invalid City" });

    const { today, tomorrow } = getTodayTomorrowStr();

    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/A-B0063-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          CountyName: locationName,
          Date: today
        },
      }
    );

    res.json({
      success: true,
      data: response.data.records,
    });
  } catch (error) {
    console.error("月出資料取得失敗", error.message);
    res.status(500).json({ error: "Fetch Failed", details: error.message });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API",
    description: "整合中央氣象署 (CWA) 開放資料，提供全台縣市天氣、健康氣象與天文資訊。",
    usage: {
      base_url: "http://<host>:<port>",
      params: {
        ":city": "縣市英文代碼 (參考 cities 列表)"
      }
    },
    features: [
      {
        name: "一般天氣預報 (36H)",
        endpoint: "/api/weather/:city",
        description: "取得今明 36 小時的天氣預報，包含溫度、降雨機率、舒適度等。"
      },
      {
        name: "健康氣象 - 溫差提醒",
        endpoint: "/api/health/temp-difference/:city",
        description: "未來 72 小時的氣溫變化與溫差警示指數及穿搭建議。"
      },
      {
        name: "天文 - 日出日沒",
        endpoint: "/api/astronomy/sun/:city",
        description: "年度逐日日出日沒時刻資料。"
      },
      {
        name: "天文 - 月出月沒",
        endpoint: "/api/astronomy/moon/:city",
        description: "年度逐日月出月沒時刻資料。"
      }
    ],
    examples: [
      "/api/weather/taipei",
      "/api/health/temp-difference/kaohsiung",
      "/api/astronomy/sun/taichung"
    ],
    endpoints: {
      weather: "/api/weather/:city",
      tempDiff: "/api/health/temp-difference/:city",
      sun: "/api/astronomy/sun/:city",
      moon: "/api/astronomy/moon/:city",
      health: "/api/health",
    },
    cities: CITY_MAP,
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/api/weather/:city", getWeatherByCity);
app.get("/api/health/temp-difference/:city", getTempDiffByCity);
app.get("/api/astronomy/sun/:city", getSunScheduleByCity);
app.get("/api/astronomy/moon/:city", getMoonScheduleByCity);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});
