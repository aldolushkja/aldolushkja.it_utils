package it.aldolushkja.utils.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import it.aldolushkja.utils.enumz.Role;
import java.time.LocalDateTime;
import javax.persistence.Entity;
import javax.persistence.EnumType;
import javax.persistence.Enumerated;

@Entity(name = "t_person")
public class Person extends PanacheEntity {

  public String firstname;
  public String lastname;
  public String email;
  public boolean enabled;
  public LocalDateTime lastLogin;
  @Enumerated(EnumType.STRING)
  public Role role;

}
