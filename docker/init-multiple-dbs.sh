#!/bin/bash
set -e

# Không cần tạo DB keycloak nữa vì nó đã được tạo qua biến môi trường.
# Chỉ cần tạo DB thingsboard:
echo "Creating database 'thingsboard'"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE thingsboard;
    GRANT ALL PRIVILEGES ON DATABASE thingsboard TO $POSTGRES_USER;
EOSQL