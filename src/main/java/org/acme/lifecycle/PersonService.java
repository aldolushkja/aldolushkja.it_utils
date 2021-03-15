package org.acme.lifecycle;

import javax.annotation.PostConstruct;
import javax.inject.Singleton;
import io.quarkus.runtime.Startup;

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
