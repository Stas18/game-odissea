const questions = require('../data/questions.json');

/**
 * Получает описание локации по её идентификатору.
 * 
 * @param {number|string} pointId - Уникальный идентификатор точки (локации), для которой требуется получить описание.
 * @returns {string} - Описание локации из данных questions.json. Если точка не найдена — возвращает "Неизвестная локация".
 * 
 * @description
 * Используется для отображения человекочитаемого названия или описания локации в интерфейсе бота.
 * Поиск осуществляется по полю `pointId` в массиве вопросов/локаций.
 */
function getPointDescription(pointId) {
  const point = questions.find(p => p.pointId === pointId);
  return point ? point.location : "Неизвестная локация";
}


/**
 * Формирует inline-клавиатуру Telegram с кнопками для выбора локаций.
 * 
 * @param {Array<number|string>} points - Массив идентификаторов точек (локаций), для которых нужно создать кнопки.
 * @returns {Object} - Объект с полем `reply_markup`, содержащим структуру inline-клавиатуры Telegram.
 *                   Каждая кнопка имеет текст вида "📍 Локация {ID} - {Описание}" и callback_data вида "point_{ID}".
 * 
 * @description
 * Предназначен для отображения пользователю списка доступных локаций с возможностью выбора.
 * Использует `getPointDescription` для получения описания каждой точки.
 */
function getKeyboard(points) {
  return {
    reply_markup: {
      inline_keyboard: points.map(point => [
        {
          text: `📍 Локация ${point} - ${getPointDescription(point)}`,
          callback_data: `point_${point}`
        }
      ])
    }
  };
}


/**
 * Формирует inline-клавиатуру с кнопками навигации к выбранной точке через популярные картографические сервисы.
 * 
 * @param {number|string} pointId - Идентификатор точки, для которой требуется сформировать навигационную клавиатуру.
 * @returns {Object|null} - Объект клавиатуры с кнопками для Google Maps, Яндекс.Карт, 2GIS и Telegram-карты.
 *                          Возвращает `null`, если точка не найдена или у неё отсутствуют координаты.
 * 
 * @description
 * Используется после выбора пользователем локации, чтобы предложить ему перейти к навигации.
 * Кнопки содержат прямые ссылки с координатами (lat, lng) на внешние карты и callback для открытия карты внутри Telegram.
 * Форматы URL соответствуют требованиям каждого сервиса.
 */
function getNavigationKeyboard(pointId) {
  const point = questions.find(p => p.pointId === pointId);
  if (!point || !point.coordinates) return null;

  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🗺️ Google Maps',
            url: `https://maps.google.com/?q=${point.coordinates.lat},${point.coordinates.lng}`
          },
          {
            text: '📍 Яндекс.Карты',
            url: `https://yandex.ru/maps/?pt=${point.coordinates.lng},${point.coordinates.lat}&z=17&l=map`
          }
        ],
        [
          {
            text: '📱 2GIS',
            url: `https://2gis.ru/geo/${point.coordinates.lng},${point.coordinates.lat}`
          },
          {
            text: '📍 Telegram',
            callback_data: `show_map_${pointId}`
          }
        ]
      ]
    }
  };
}

module.exports = {
  getKeyboard,
  getPointDescription,
  getNavigationKeyboard
};
