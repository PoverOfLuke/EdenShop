import os
import json
import discord

TOKEN = os.environ["DISCORD_TOKEN"]
CHANNEL_ID = int(os.environ["CHANNEL_ID"])

intents = discord.Intents.default()
intents.message_content = True

client = discord.Client(intents=intents)


@client.event
async def on_ready():
    print(f"Connesso come {client.user}")

    channel = client.get_channel(CHANNEL_ID)

    if channel is None:
        print("ERRORE: canale non trovato")
        await client.close()
        return

    messages = []

    async for message in channel.history(limit=50):
        messages.append({
            "id": str(message.id),
            "author": str(message.author),
            "content": message.content,
            "created_at": message.created_at.isoformat()
        })

    with open("data.json", "w", encoding="utf-8") as file:
        json.dump(messages, file, ensure_ascii=False, indent=2)

    print(f"Salvati {len(messages)} messaggi")

    await client.close()


client.run(TOKEN)
