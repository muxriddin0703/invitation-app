# 💌 Taklifnoma Bot

Telegram бот + веб-сайт для создания приглашений.

## Как работает

1. Пользователь пишет боту `/start`
2. Нажимает кнопку → открывается форма прямо в Telegram (Web App)
3. Заполняет форму → нажимает **Yaratish**
4. Получает ссылку → пересылает другу
5. Друг открывает ссылку, видит красивое приглашение, нажимает Ha/Yo'q
6. **Создатель получает уведомление в Telegram** с ответом

## Переменные окружения

| Переменная | Значение |
|---|---|
| `BOT_TOKEN` | Токен от @BotFather |
| `MONGO_URI` | URI MongoDB Atlas |
| `BASE_URL` | URL сайта (например `https://app.railway.app`) |
| `ADMIN_PASSWORD` | Пароль для веб-панели |

## Деплой на Railway

1. Загрузи код на GitHub
2. Railway → New Project → Deploy from GitHub
3. Добавь Variables (см. таблицу выше)
4. Нажми Deploy
