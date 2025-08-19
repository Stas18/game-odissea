module.exports = {
  getKeyboard: (isGameActive = false) => ({
    reply_markup: {
      keyboard: [
        ['📊 Статистика'],
        ['🔄 Сбросить прогресс', '📢 Рассылка'],
        [isGameActive ? '⏸ Остановить игру' : '✅ Запустить игру'],
        ['🏆 Показать топ', '⬅️ В главное меню']
      ],
      resize_keyboard: true
    }
  })
};