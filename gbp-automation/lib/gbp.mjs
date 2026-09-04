// Thin wrappers over the Google Business Profile REST APIs.
// Account/location discovery uses the v1 APIs; posts & reviews use the legacy v4 API.

const ACCT_MGMT = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BIZ_INFO  = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const V4        = 'https://mybusiness.googleapis.com/v4';

async function api(token, url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

// Returns "accounts/123456789"
export async function getFirstAccount(token) {
  const data = await api(token, `${ACCT_MGMT}/accounts`);
  if (!data.accounts?.length) throw new Error('No GBP accounts found for this login.');
  return data.accounts[0].name; // e.g. "accounts/123"
}

// Returns [{ name: "locations/456", title }]
export async function listLocations(token, accountName) {
  const url = `${BIZ_INFO}/${accountName}/locations?readMask=name,title&pageSize=100`;
  const data = await api(token, url);
  return data.locations || [];
}

// v4 paths need "accounts/{a}/locations/{l}". Build it from account + location id.
export function v4Path(accountName, locationName) {
  const locId = locationName.split('/').pop();
  return `${accountName}/locations/${locId}`;
}

export async function listReviews(token, v4Parent) {
  let reviews = [], pageToken;
  do {
    const url = `${V4}/${v4Parent}/reviews?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const data = await api(token, url);
    reviews = reviews.concat(data.reviews || []);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return reviews;
}

export async function replyToReview(token, reviewName, comment) {
  // reviewName = "accounts/.../locations/.../reviews/..."
  return api(token, `${V4}/${reviewName}/reply`, 'PUT', { comment });
}

export async function createLocalPost(token, v4Parent, post) {
  return api(token, `${V4}/${v4Parent}/localPosts`, 'POST', post);
}
