module.exports = {
  getKeyboard: () => ({
    reply_markup: {
      keyboard: [
        ['📊 Статистика'],
        ['🔄 Сбросить прогресс', '📢 Рассылка'],
        ['🏆 Показать топ', '⬅️ В главное меню']
      ],
      resize_keyboard: true
    }
  })
};