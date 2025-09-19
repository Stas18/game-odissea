module.exports = {
  getKeyboard: (isGameActive = false) => ({
    reply_markup: {
      keyboard: [
        ['📊 Статистика'],
        ['🔄 Сбросить прогресс', '🧹 Чистка призов'],
        [isGameActive ? '⏸ Остановить игру' : '✅ Запустить игру'],
        ['🏆 Показать топ', '📢 Рассылка'],
        ['🏆 Рассчитать призёров', '⬅️ В главное меню']
      ],
      resize_keyboard: true
    }
  })
};