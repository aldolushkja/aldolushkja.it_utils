package org.acme.lifecycle;

import javax.annotation.PostConstruct;
import javax.inject.Singleton;
import javax.transaction.Transactional;
import io.quarkus.runtime.Startup;

@Startup
@Singleton
@Loggable
public class UserService {

  @PostConstruct
  public void init() {
    // this.buildInitUsers();
  }

  @Transactional
  public void buildInitUsers() {
    User.persist(User.buildRandomUser());
  }
}
