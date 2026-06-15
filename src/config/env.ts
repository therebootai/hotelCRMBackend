const getEnv = (key: string, required = true): string => {
  const value = process.env[key];

  if (!value && required) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value || "";
};

const env = {
  ENV: process.env.ENV || "development",
  PORT: Number(process.env.PORT) || 5000,

  CLIENT_URL: getEnv("CLIENT_URL"),

  MONGODB_URI: getEnv("MONGODB_URI"),

  TOKEN_SECRET: getEnv("TOKEN_SECRET"),

  WA_APP_KEY: getEnv("WA_APP_KEY", false),
  WA_AUTH_KEY: getEnv("WA_AUTH_KEY", false),
  WA_DEVICE_ID: getEnv("WA_DEVICE_ID", false),
  WA_API_URL: getEnv("WA_API_URL", false),
  WA_TEMPLATE_CANCEL: getEnv("WA_TEMPLATE_CANCEL", false),
  WA_TEMPLATE_CHECKOUT_REMINDER: getEnv("WA_TEMPLATE_CHECKOUT_REMINDER", false),
  WA_TEMPLATE_CHECKIN: getEnv("WA_TEMPLATE_CHECKIN", false),
  WA_TEMPLATE_BOOKING_CONFIRMATION: getEnv("WA_TEMPLATE_BOOKING_CONFIRMATION", false),
} as const;

export default env;