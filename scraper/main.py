import os
import json
import discord

TOKEN = os.environ["DISCORD_TOKEN"]
CHANNEL_ID = int(os.environ["CHANNEL_ID"])

DATA_FILE = "data.json"

intents = discord.Intents.default()
intents.message_content = True

client = discord.Client(intents=intents)


def load_data():
    if not os.path.exists(DATA_FILE):
        return {
            "last_message_id": None,
            "messages": []
        }

    with open(DATA_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


@client.event
async def on_ready():
    print(f"Connesso come {client.user}")

    channel = client.get_channel(CHANNEL_ID)

    if channel is None:
        print("ERRORE: canale non trovato")
        await client.close()
        return

    data = load_data()

    last_message_id = data.get("last_message_id")
    new_messages = []

    async for message in channel.history(limit=None, after=discord.Object(id=int(last_message_id)) if last_message_id else None, oldest_first=True):

        new_messages.append({
            "id": str(message.id),
            "author": str(message.author),
            "content": message.content,
            "created_at": message.created_at.isoformat()
        })

    if new_messages:
        data["messages"].extend(new_messages)

        # L'ultimo messaggio diventa il nuovo punto di partenza
        data["last_message_id"] = new_messages[-1]["id"]

        save_data(data)

        print(f"Nuovi messaggi salvati: {len(new_messages)}")
        print(f"Ultimo message ID: {data['last_message_id']}")

    else:
        print("Nessun nuovo messaggio.")

    await client.close()


client.run(TOKEN)
