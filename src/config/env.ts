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
} as const;

export default env;