#!/bin/bash
docker compose up testbed -d
ssh-keygen -R '[localhost]:4000'
TEST_PW=passw0rd npm run test
docker compose rm --stop --force testbed
