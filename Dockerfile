FROM node:4.1
ENV HOME=/iotbroker

WORKDIR $HOME
COPY package.json $HOME/package.json
COPY . $HOME

RUN npm install
EXPOSE 1026
EXPOSE 1027


CMD ["node","./bin/broker"]

