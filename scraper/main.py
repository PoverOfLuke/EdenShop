```python
import os
import json
import discord
import psycopg

DATA_FILE = "data.json"

TOKEN = os.environ["DISCORD_TOKEN"]
CHANNEL_ID = int(os.environ["CHANNEL_ID"])
DATABASE_URL = os.environ["NEON_DATABASE_URL"]


def load_data():
    if not os.path.exists(DATA_FILE):
        return {
            "last_message_id": None,
            "messages": []
        }

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def save_to_neon(messages):
    if not messages:
        print("Nessun nuovo messaggio da inserire in Neon.")
        return

    print(f"Inserimento di {len(messages)} messaggi in Neon...")

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            for message in messages:
                cur.execute(
                    """
                    INSERT INTO messages (
                        discord_message_id,
                        author,
                        content,
                        created_at
                    )
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (discord_message_id) DO NOTHING
                    """,
                    (
                        message["id"],
                        message["author"],
                        message["content"],
                        message["created_at"]
                    )
                )

        conn.commit()

    print("Messaggi salvati in Neon.")


class DiscordClient(discord.Client):
    async def on_ready(self):
        print(f"Connesso come {self.user}")

        channel = self.get_channel(CHANNEL_ID)

        if channel is None:
            print("Canale non trovato.")
            await self.close()
            return

        data = load_data()
        last_message_id = data.get("last_message_id")

        new_messages = []

        if last_message_id is None:
            print("Prima esecuzione: recupero dello storico...")

            async for message in channel.history(
                limit=None,
                oldest_first=True
            ):
                new_messages.append({
                    "id": str(message.id),
                    "author": message.author.name,
                    "content": message.content,
                    "created_at": message.created_at.isoformat()
                })

        else:
            print(f"Recupero messaggi dopo {last_message_id}...")

            async for message in channel.history(
                limit=None,
                after=discord.Object(id=int(last_message_id)),
                oldest_first=True
            ):
                new_messages.append({
                    "id": str(message.id),
                    "author": message.author.name,
                    "content": message.content,
                    "created_at": message.created_at.isoformat()
                })

        if not new_messages:
            print("Nessun nuovo messaggio.")
            await self.close()
            return

        print(f"Trovati {len(new_messages)} nuovi messaggi.")

        # Prima salviamo i messaggi in Neon.
        # Se Neon restituisce un errore, questa funzione
        # solleva l'errore e data.json NON viene aggiornato.
        save_to_neon(new_messages)

        # Solo se Neon è andato a buon fine aggiorniamo
        # lo storico locale.
        data["messages"].extend(new_messages)
        data["last_message_id"] = new_messages[-1]["id"]

        save_data(data)

        print("Aggiornamento completato.")

        await self.close()


intents = discord.Intents.default()
intents.message_content = True

client = DiscordClient(intents=intents)

client.run(TOKEN)
```
