package it.aldolushkja.utils.service;

import com.github.javafaker.Faker;
import it.aldolushkja.utils.entity.Person;
import it.aldolushkja.utils.enumz.Role;
import it.aldolushkja.utils.interceptor.Loggable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import javax.annotation.PostConstruct;
import javax.inject.Singleton;
import javax.transaction.Transactional;

//@Startup
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

//    this.buildInitPeople();
  }

  @Transactional
  public void buildInitPeople() {
    Faker faker = new Faker();
    List<Person> defaults = new ArrayList<>();
    for (int i = 0; i < 10; i++) {
      Person person = new Person();
      person.firstname = faker.name().firstName();
      person.lastname = faker.name().lastName();
      person.email = faker.internet().emailAddress();
      person.lastLogin = LocalDateTime.now();
      person.enabled = true;
      person.role = Role.GUEST;
      defaults.add(person);
    }

    Person.persist(defaults);

  }
}
