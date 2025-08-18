const pointDescriptions = {
  1: "Графская пристань",
  2: "Площадь Нахимова",
  3: "Театр Луначарского",
  4: "Парк Победы"
};

function getPointDescription(pointId) {
  return pointDescriptions[pointId] || "Неизвестная локация";
}

function getKeyboard(points) {
  return {
    reply_markup: {
      inline_keyboard: points.map(point => [
        { 
          text: `Точка ${point} - ${getPointDescription(point)}`, 
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