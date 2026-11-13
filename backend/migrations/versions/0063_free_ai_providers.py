"""Providers that give a free API key (OpenRouter, Groq, Cerebras, Mistral, SambaNova, GitHub
Models, NVIDIA, Hugging Face) become built-in providers with fixed official endpoints, so a company
can keep a key for each, beside OpenAI, Anthropic, Gemini and one custom endpoint.
"""

from alembic import op

revision = "0063"
down_revision = "0062"

NEW = (
    "'openai', 'anthropic', 'gemini', 'openai_compatible', 'openrouter', 'groq', 'cerebras',"
    " 'mistral', 'sambanova', 'github', 'nvidia', 'huggingface'"
)
OLD = "'openai', 'anthropic', 'gemini', 'openai_compatible'"


def _replace(values: str) -> None:
    # The first version's check had no name of its own; drop whichever check names the provider.
    op.execute("""DO $$ DECLARE name text; BEGIN
      FOR name IN SELECT conname FROM pg_constraint
        WHERE conrelid = 'ai_credentials'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%provider%'
      LOOP EXECUTE format('ALTER TABLE ai_credentials DROP CONSTRAINT %I', name); END LOOP;
    END $$""")
    op.execute(
        "ALTER TABLE ai_credentials ADD CONSTRAINT ai_credentials_provider_check"
        f" CHECK (provider IN ({values}))"
    )


def upgrade() -> None:
    _replace(NEW)


def downgrade() -> None:
    op.execute(f"DELETE FROM ai_credentials WHERE provider NOT IN ({OLD})")
    _replace(OLD)
