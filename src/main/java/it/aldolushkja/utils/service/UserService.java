package it.aldolushkja.utils.service;

import io.quarkus.runtime.Startup;
import it.aldolushkja.utils.entity.User;
import it.aldolushkja.utils.interceptor.Loggable;
import javax.annotation.PostConstruct;
import javax.inject.Singleton;
import javax.transaction.Transactional;

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
