from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    plaid_client_id: str
    plaid_secret: str
    plaid_env: str = "sandbox"

    database_url: str = "sqlite:///./money_tracker.db"
    cors_origins: str = "http://localhost:5173"
    plaid_redirect_uri: str = "http://localhost:5173/"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
