const theme = {
  prefix: "☀️✨ ",
  errorPrefix: "⛈️ ",
};

export const logger = {
  log: (...args: any[]) => {
    console.log(theme.prefix, ...args);
  },
  error: (...args: any[]) => {
    console.error(theme.errorPrefix, ...args);
  },
};
