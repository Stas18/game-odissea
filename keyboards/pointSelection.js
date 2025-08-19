const pointDescriptions = {
  1: "Название улицы",
  2: "Название улицы",
  3: "Название улицы",
  4: "Название улицы",
  5: "Название улицы",
  6: "Название улицы",
  7: "Название улицы",
  8: "Название улицы",
  9: "Название улицы",
  10: "Название улицы"
};

function getPointDescription(pointId) {
  return pointDescriptions[pointId] || "Неизвестная локация";
}

function getKeyboard(points) {
  return {
    reply_markup: {
      inline_keyboard: points.map(point => [
        { 
          text: `Локация ${point} - ${getPointDescription(point)}`, 
          callback_data: `point_${point}` 
        }
      ])
    }
  };
}

module.exports = {
  getKeyboard,
  getPointDescription
};