module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Drizzle's expo migrator imports generated .sql migration files as strings.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
