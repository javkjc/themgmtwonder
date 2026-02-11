
#!/bin/bash
set -e

# Config
BASE_URL="http://localhost:3000"
BASELINE_ID="cfeed4ff-7886-4784-9bde-4bda116b8e0d"
COOKIE_FILE="cookies.txt"

# 1. Login
echo "🔐 Logging in..."
curl -s -c $COOKIE_FILE -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"12341234"}' > /dev/null

# Extract CSRF
CSRF_TOKEN=$(grep "todo_csrf" $COOKIE_FILE | awk '{print $7}' | sed 's/%3D/=/g')
# echo "CSRF: $CSRF_TOKEN"

# 2. Create a Table
echo "📊 Creating table..."
TABLE_RES=$(curl -s -b $COOKIE_FILE -X POST "$BASE_URL/baselines/$BASELINE_ID/tables" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"cellValues":[["test"]],"tableLabel":"D1 Verification"}')

TABLE_ID=$(echo $TABLE_RES | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   Table ID: $TABLE_ID"

if [ -z "$TABLE_ID" ]; then
  echo "❌ Failed to create table: $TABLE_RES"
  exit 1
fi

# 3. Simulate Utilization (Lock)
echo "🔒 Simulating utilization (DB Update)..."
docker compose exec -T db psql -U todo -d todo_db -c "UPDATE extraction_baselines SET utilized_at = NOW(), utilization_type = 'data_exported' WHERE id = '$BASELINE_ID';" > /dev/null

# 4. Attempt Update (Expect 403)
echo "📝 Attempting update on locked table..."
UPDATE_RES=$(curl -s -o /dev/null -w "%{http_code}" -b $COOKIE_FILE -X PUT "$BASE_URL/tables/$TABLE_ID/cells/0/0" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"value":"exploit"}')

if [ "$UPDATE_RES" == "403" ]; then
  echo "   ✅ Blocked with 403 (Expected)"
else
  echo "   ❌ Failed: Got HTTP $UPDATE_RES (Expected 403)"
fi

# 5. Cleanup (Unlock & Delete)
echo "🔓 Unlocking baseline..."
docker compose exec -T db psql -U todo -d todo_db -c "UPDATE extraction_baselines SET utilized_at = NULL WHERE id = '$BASELINE_ID';" > /dev/null

echo "🗑️ Deleting table..."
curl -s -b $COOKIE_FILE -X DELETE "$BASE_URL/tables/$TABLE_ID" \
  -H "x-csrf-token: $CSRF_TOKEN" > /dev/null

echo "🎉 D1 Verification Complete"
rm $COOKIE_FILE
