module.exports = {
  getKeyboard: (isGameActive = false) => ({
    reply_markup: {
      keyboard: [
        ['📊 Статистика', '📢 Рассылка'],
        ['🔄 Сбросить прогресс', '🧹 Чистка призов'],
        [isGameActive ? '⏸ Остановить игру' : '✅ Запустить игру'],
        ['⬅️ В главное меню']
      ],
      resize_keyboard: true
    }
  })
};