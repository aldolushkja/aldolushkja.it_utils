package it.aldolushkja.utils.service;

import io.quarkus.runtime.Startup;
import it.aldolushkja.utils.interceptor.Loggable;
import javax.annotation.PostConstruct;
import javax.inject.Singleton;

@Startup
@Singleton
@Loggable
public class PersonService {

  @PostConstruct
  public void init() {
    // for (int i = 0; i < 10; i++) {
    // Person.persist(Person.buildAdmin("admin" + i));
    // }
    // for (int i = 0; i < 10; i++) {
    // Person.persist(Person.buildGuest("guest" + i));
    // }
  }
}
