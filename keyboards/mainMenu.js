module.exports = {
  getKeyboard: (isAdmin = false) => {
    const buttons = [
      [{ text: '🌍 Выбрать точку' }],
      [{ text: '🎲 Мини-квест' }, { text: '📊 Прогресс' }],
      [{ text: '🏆 Топ команд' }, { text: '📞 Помощь' }]
    ];

    if (isAdmin) {
      buttons.push([{ text: '👑 Админ-панель' }]);
    }

    return {
      reply_markup: {
        keyboard: buttons,
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
  }
};