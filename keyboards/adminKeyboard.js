module.exports = {
  getKeyboard: (isGameActive = false) => ({
    reply_markup: {
      keyboard: [
        ['📊 Статистика'],
        ['🔄 Сбросить прогресс', '🧹 Чистка призов'],
        [isGameActive ? '⏸ Остановить игру' : '✅ Запустить игру'],
        ['🏆 Показать топ', '📢 Рассылка'],
        ['⬅️ В главное меню']
      ],
      resize_keyboard: true
    }
  })
};
