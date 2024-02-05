#!/bin/bash
docker-compose up testbed -d
TEST_PW=passw0rd npm run test
docker-compose rm --stop --force testbed
