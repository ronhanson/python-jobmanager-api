#docker build -t ronhanson/jobmanager-api .

docker run --rm -ti --name jobmanager-api -p 5000:5000 ronhanson/jobmanager-api $*
