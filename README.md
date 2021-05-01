# Utils Backend

This is the backend of this website: https://aldolushkja.it/utils . Contains:

1. Java
2. Quarkus
3. MySQL Database/PostgreSQL
4. Docker
5. Scripts for running in different environment

### Run app in dev mode

First create **.env** file in root directory of the project, check your database provider  then run:
```shell
mvn compile quarkus:dev
```

### Run app in dev mode
First create \*.env file in root directory of the project, then run:
```shell
mvn compile quarkus:dev
```

### Build jar package
**JVM Mode**

```shell
mvn package
```

**Native Mode**
```shell
mvn package -Pnative
```
