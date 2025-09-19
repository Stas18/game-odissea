// config/loggerConfig.js
module.exports = {
  // Уровень логирования: ERROR, WARN, INFO, DEBUG
  level: process.env.LOG_LEVEL || 'INFO',
  
  // Путь к лог-файлу
  logFile: process.env.LOG_FILE || './logs/bot.log',
  
  // Максимальный размер лог-файла перед ротацией (в байтах)
  maxFileSize: process.env.LOG_MAX_SIZE || 10485760, // 10MB
  
  // Количество сохраняемых лог-файлов
  maxFiles: process.env.LOG_MAX_FILES || 5
};