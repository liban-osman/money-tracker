import plaid
from plaid.api import plaid_api
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.institutions_get_by_id_request import InstitutionsGetByIdRequest
from plaid.model.item_get_request import ItemGetRequest
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.transactions_sync_request import TransactionsSyncRequest

from app.core.config import settings

_ENV_HOSTS = {
    "sandbox": plaid.Environment.Sandbox,
    "production": plaid.Environment.Production,
}

_LOCAL_USER_ID = "money-tracker-local-user"


def get_client() -> plaid_api.PlaidApi:
    configuration = plaid.Configuration(
        host=_ENV_HOSTS[settings.plaid_env],
        api_key={"clientId": settings.plaid_client_id, "secret": settings.plaid_secret},
    )
    api_client = plaid.ApiClient(configuration)
    return plaid_api.PlaidApi(api_client)


def create_link_token() -> str:
    client = get_client()
    request = LinkTokenCreateRequest(
        products=[Products("transactions")],
        client_name="Money Tracker",
        country_codes=[CountryCode("CA")],
        language="en",
        user=LinkTokenCreateRequestUser(client_user_id=_LOCAL_USER_ID),
        redirect_uri=settings.plaid_redirect_uri,
    )
    response = client.link_token_create(request)
    print(f"[plaid_service] issued link token with country_codes={request['country_codes']}", flush=True)
    return response.link_token


def exchange_public_token(public_token: str) -> tuple[str, str]:
    """Returns (access_token, item_id)."""
    client = get_client()
    request = ItemPublicTokenExchangeRequest(public_token=public_token)
    response = client.item_public_token_exchange(request)
    return response.access_token, response.item_id


def get_institution_name(access_token: str) -> str:
    client = get_client()
    item = client.item_get(ItemGetRequest(access_token=access_token)).item
    institution = client.institutions_get_by_id(
        InstitutionsGetByIdRequest(
            institution_id=item.institution_id, country_codes=[CountryCode("CA")]
        )
    ).institution
    return institution.name


def get_accounts(access_token: str) -> list[dict]:
    client = get_client()
    response = client.accounts_get(AccountsGetRequest(access_token=access_token))
    return [account.to_dict() for account in response.accounts]


def sync_transactions(access_token: str, cursor: str | None) -> dict:
    client = get_client()
    request = TransactionsSyncRequest(access_token=access_token, cursor=cursor) if cursor else (
        TransactionsSyncRequest(access_token=access_token)
    )
    response = client.transactions_sync(request)
    return response.to_dict()
