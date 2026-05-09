const TEN_MINUTES_MS = 10 * 60 * 1000;

const targetUrl = process.argv[2] || process.env.PING_URL;

if (!targetUrl) {
  console.error(
    "Provide URL: node server/ping-bot.js https://example.com or set PING_URL env variable."
  );
  process.exit(1);
}

const pingSite = async () => {
  const start = Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: { "User-Agent": "evryka-ping-bot/1.0" },
    });

    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${response.status} ${response.statusText} (${duration} ms)`
    );
  } catch (error) {
    const duration = Date.now() - start;
    console.error(
      `[${new Date().toISOString()}] Request failed after ${duration} ms: ${error.message}`
    );
  }
};

console.log(`Ping bot started for ${targetUrl}. Interval: 10 minutes.`);
pingSite();
setInterval(pingSite, TEN_MINUTES_MS);
